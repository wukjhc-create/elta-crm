# Prod-gate-batch (oktober 2026) — samlet køreplan

Alt herunder er færdigt på staging og venter KUN på Henriks godkendelse. Hver migration køres som før:
allowlist i `scripts/prod-apply-migration.ts` → pre-check → `npm run prod:apply-migration -- <nr> --approved-by-henrik`
→ post-check. **Stop hele sekvensen ved første afvigelse.** Rækkefølgen er valgt så hvert trin er uafhængigt
verificerbart, og så intet flag tændes før dets migration er i prod.

| # | Hvad | Effekt for brugerne | Pre | Post | Detaljer |
|---|---|---|---|---|---|
| 1 | **00175–00177 + 00179** læse-lockdown (tokens, integrations-/firmahemmeligheder, beskeder, underskrifter) | ingen synlig ændring (koden læser allerede via service-role) | `npx tsx scripts/prod-verify-rls-wave.ts` + rls-read L1–L8 bevist på staging | prod-sensitive-columns, prod-db-audit | p009-rls-write-lockdown.md |
| 2 | **00178** P-009 runde 4 (44 kalkulations-/katalogtabeller) | ingen synlig ændring | `prod-verify-rls-wave.ts WAVE4 pre` | `... WAVE4 post` | p009-rls-write-lockdown.md |
| 3 | **00180** montør kun mails på egne sager + serviceleder ser medarbejdere | montør ser 0 mails indtil mails kobles til hans sager; serviceleder kan planlægge | `prod-verify-00180.ts pre` ✅ | `... post` | 00180-g10-mail-scope-employees.md |
| 4 | **00181** (WAVE5) montør starter/afslutter kun EGNE arbejdsordrer | lukker at montør kunne rette enhver arbejdsordre via API | `prod-verify-rls-wave.ts WAVE5 pre` ✅ | `... WAVE5 post` | p009 § Runde 5 |
| 4b | Vercel-env `MONTOR_START_JOB_ENABLED=true` + redeploy (EFTER 4) | montør får "→ Start" på sine job | — | ui: montør ser Start | p009 § Runde 5 |
| 5 | **00182** audit-identitet kan ikke forfalskes | ingen synlig ændring | `prod-verify-00182.ts pre` ✅ | `... post` | migrationens header |
| 6 | **00183** trigram-indeks (produktsøgning 2–7 s → ms) — **kør uden for 02:00-sync** (bygning blokerer skrivning til supplier_products) | hurtig søgning i tilbudslinjer | `prod-verify-00183.ts pre` ✅ | `... post` + `prod-search-timing.ts` | migrationens header |
| 7 | Vercel-env `INVOICE_ATTACHMENT_FETCH_ENABLED=true` (fakturabilag fra mail) | PDF-bilag hentes til leverandørfakturaer; backfill af ~43 mails | baseline: `prod-invoice-attachment-baseline.ts` | `prod-backfill-status.ts` | invoice-attachment-backfill.md |

**Separate beslutninger (ikke en del af batchen):** aktivering af døde crons (unanswered-mails, offer-reminders =
KUNDEMAIL, supplier-sync), DB-blokering vs. advarsel ved afsendelse af tilbud (N8), tidsgodkendelse (N2).

**Før pilot (drift, ikke kode):** G11 — montør #2's login kobles til en medarbejder
(Medarbejder → Rediger → Login). Verificér: `npx tsx scripts/prod-montor-linkage.ts`.

**Efter hele batchen:** `npx tsx scripts/prod-db-audit.ts` (HØJ/MIDDEL 0), `npx tsx scripts/prod-role-policies.ts`,
`npx tsx scripts/prod-cron-status-since.ts "<tidspunkt>"` efter næste cron-runde.
