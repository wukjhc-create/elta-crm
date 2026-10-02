# Prod-gate-batch (oktober 2026) — samlet pre/post-køreplan 00175–00183

Alt herunder er færdigt og verificeret på staging og venter KUN på Henriks godkendelse. Koden der matcher hver
migration er allerede på main/prod (expand/contract — ingen deploy i batchen, undtagen trin 2b's env-flag).

**Samlet pre-check (read-only, ændrer intet):** `npm run -s prod:batch-check -- pre` → skal ende med
`✅ alle 6 trin som forventet (pre)`. Senest kørt 2026-10-02: ✅ 6/6.

## Fremgangsmåde pr. trin

1. Henrik godkender i chat → tilføj allowlist-linjen i `scripts/prod-apply-migration.ts` (se nederst) og commit.
2. Trinnets **pre**-script (skal være ✅).
3. `npm run prod:apply-migration -- <nr> --approved-by-henrik`
4. Trinnets **post**-script (skal være ✅). **Stop hele sekvensen ved første afvigelse** og kør rollback fra
   migrationens header.

| # | Migration | Hvad | Effekt for brugerne | Pre | Post |
|---|---|---|---|---|---|
| 1 | **00180** | Montør ser kun mails på egne sager (RLS på `incoming_emails`) + serviceleder kan se medarbejdere (planlægning) | Montør ser 0 mails indtil mails kobles til hans sager; serviceleder får medarbejderliste/kalender | `npx tsx scripts/prod-verify-00180.ts pre` | `... post` |
| 2 | **00181** | WAVE5 `work_orders`: montør starter/afslutter kun EGNE arbejdsordrer | Lukker at montør kunne rette enhver arbejdsordre via REST | `npx tsx scripts/prod-verify-rls-wave.ts WAVE5 pre` | `... WAVE5 post` |
| 2b | Vercel-env | `MONTOR_START_JOB_ENABLED=true` + redeploy — **først efter trin 2** | Montør får "→ Start" på sine job | — | montør ser Start på eget job |
| 3 | **00175, 00176, 00177, 00179** | Læse-lockdown: portal-/partner-/bekræftelses-tokens, integrations-, SMTP-/SMS- og e-conomic-hemmeligheder skjult for bruger-sessionen; interne beskeder kun egne; kundeunderskrifter kun via service-role | Ingen synlig ændring (koden læser allerede via service-role) | `npx tsx scripts/prod-verify-read-lockdown.ts <nr> pre` | `... <nr> post` |
| 4 | **00178** | WAVE4: skrivelås på 44 kalkulations-/katalogtabeller | Ingen synlig ændring | `npx tsx scripts/prod-verify-rls-wave.ts WAVE4 pre` | `... WAVE4 post` |
| 5 | **00182** | `log_audit_event` bruger `auth.uid()` — audit-identitet kan ikke forfalskes | Ingen synlig ændring | `npx tsx scripts/prod-verify-00182.ts pre` | `... post` |
| 6 | **00183** | Trigram-indeks på `supplier_products` (søgning 2–7 s → ms). **Kør uden for 02:00-sync**: indeksbygning blokerer skrivning til `supplier_products` | Hurtig søgning i tilbudslinjer/materialer | `npx tsx scripts/prod-verify-00183.ts pre` | `... post` + `npx tsx scripts/prod-search-timing.ts` |

Trin 3 køres i nummerorden (00175 → 00176 → 00177 → 00179), hver med sit eget pre/post. Verifieren læser
kolonnelisterne direkte fra migrationsfilerne. **Pre** tjekker at hver grant-kolonne findes i prod, så GRANT ikke
fejler. Den lister også præcis hvilke kolonner der skjules (2026-10-02: kun `token`, de 5 integrationshemmeligheder,
`smtp_password`/`sms_gateway_*` og `api_token`/`agreement_grant_token`). **Post** tjekker:

- authenticated har ikke længere tabel-SELECT;
- offentlige kolonner er læsbare, og hemmelige er ikke;
- anon er uden grants;
- `messages_select_own` er den eneste SELECT-policy.

Post-logikken er bevist grøn på staging (`npm run -s harness:verify-read-lockdown -- all post`). Mod prod fanger den
korrekt 16 afvigelser, fordi lockdown ikke er anvendt endnu.

**Rækkefølge:** 00180 og 00181 først (Henrik 2026-10-02), fordi de har brugerværdi (montør-scope, planlægning,
Start-knap). Resten er rene sikkerhedslukninger uden synlig effekt. Trinene er indbyrdes uafhængige: ingen migration
bruger objekter fra en anden i batchen.

**Efter hele batchen:**

- `npm run -s prod:batch-check -- post`, som skal give ✅ 6/6;
- `npx tsx scripts/prod-db-audit.ts` (HØJ/MIDDEL 0);
- `npx tsx scripts/prod-role-policies.ts`;
- efter næste cron-runde: `npx tsx scripts/prod-cron-status-since.ts "<tidspunkt>"`.

### Allowlist-linjer (tilføjes FØRST ved Henriks godkendelse — ikke før)

```ts
  '00180': '<dato>', // G10 montør-mailscope + serviceleder ser medarbejdere, godkendt af Henrik i chat <dato>
  '00181': '<dato>', // P-009 WAVE5 work_orders (montør kun egne), godkendt af Henrik i chat <dato>
  '00175': '<dato>', // P-009 læse-lockdown A1 (tokens, beskeder), godkendt af Henrik i chat <dato>
  '00176': '<dato>', // P-009 læse-lockdown A2 (integrationshemmeligheder), godkendt af Henrik i chat <dato>
  '00177': '<dato>', // P-009 læse-lockdown A3 (bekræftelses-tokens, underskrifter), godkendt af Henrik i chat <dato>
  '00179': '<dato>', // P-009 læse-lockdown A4 (firma-/e-conomic-hemmeligheder), godkendt af Henrik i chat <dato>
  '00178': '<dato>', // P-009 WAVE4 (kalkulations-/katalogtabeller), godkendt af Henrik i chat <dato>
  '00182': '<dato>', // D2 audit-identitet, godkendt af Henrik i chat <dato>
  '00183': '<dato>', // N4 trigram-indeks (uden for 02:00-sync), godkendt af Henrik i chat <dato>
```

## Separate gates (ikke en del af batchen)

| Gate | Status | Rækkefølge / verifikation |
|---|---|---|
| **00184** D26: `customer_documents.visible_to_customer` (sagsfotos/mailbilag interne som standard, aktivt "Del med kunde") | Staging ✅, kode på branch `d26-internal-case-docs` (ikke main) | **Migration FØRST, derefter merge af branchen** (koden filtrerer på kolonnen). Prod-effekt (read-only 2026-10-02): 18 dokumenter; 3 mailbilag bliver interne, 15 forbliver synlige, 0 sagsuploads. Pre: `npx tsx scripts/prod-case-upload-docs.ts`. Post: `columns customer_documents` + U59 |
| **00186** D28: bogholderi læser kun mails koblet til en kunde eller kilde til en leverandørfaktura (ikke hele postkassen) | Staging ✅ (rls-read L12), app-del på main | **Efter 00180** (erstatter dens mail-policy). Ingen kodeafhængighed. Prod-effekt (read-only 2026-10-02): bogholderi 805 → 241 mails (214 kundekoblede + 27 fakturakilder). Pre/post: `npx tsx scripts/prod-verify-00186.ts pre|post` |
| Vercel-env `INVOICE_ATTACHMENT_FETCH_ENABLED=true` (fakturabilag fra mail) | Klar | Baseline: `prod-invoice-attachment-baseline.ts` → post: `prod-backfill-status.ts` (invoice-attachment-backfill.md) |
| Aktivering af døde crons (unanswered-mails, offer-reminders = KUNDEMAIL, supplier-sync) | Kræver separat godkendelse | — |
| Live e-conomic-bogføring | Kræver nøgler + godkendelse | Kun preview/mapping i dag |

**Før pilot (drift, ikke kode):** G11. Montør #2's login skal kobles til en medarbejder
(Medarbejder → Rediger → Login). Verificér med `npx tsx scripts/prod-montor-linkage.ts`.
