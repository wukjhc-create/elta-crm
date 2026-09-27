# Cron-discovery (backlog P1 #9) — 2026-09-27

**Status:** analyse færdig · **intet aktiveret** · ingen prod-write.
Kilder: kodeanalyse af `src/app/api/cron/*` og read-only prod-måling (`npx tsx scripts/prod-cron-discovery.ts`).
Maskinlæsbart register: [`src/lib/services/cron-registry.ts`](../../src/lib/services/cron-registry.ts). `npm run ops:cron-check` holder det i sync med `vercel.json`.

## Hvad er ændret (kun synlighed)
- Alle 15 cron-routes er pakket i `withCronRun` ([cron-run.ts](../../src/lib/services/cron-run.ts)). Hver autoriseret kørsel skriver én række i `system_health_log` (`service='cron'`):
  - `ok` ved 2xx
  - `warning` ved 4xx
  - `error` ved 5xx eller exception
  - 401 logges ikke
- Før skrev kun system-health-check sine kørsler. Fejl i de andre 14 crons endte kun i Vercel-loggen.
- Adfærden er uændret: samme svar, og logningen kan ikke kaste. Verificeret med `npm run harness:cron-log` 6/6.
- Begrænsning: en **stille no-op** (HTTP 200 med 0 rækker) logges som `ok`. De kendte no-ops er derfor markeret i registeret med `knownIssue` og vises i Pilot Health.

## Prod-fakta (read-only, 2026-09-27)

| Cron | Målt |
|---|---|
| offer-reminders (kundemail) | `reminder_enabled=true`, interval 3 d, max 3. **0 rykkere sendt seneste 30 dage.** |
| invoice-reminders (kundemail) | 80 log-rækker, alle `skipped`, level 1, samme faktura dagligt siden 2026-07-10 (reason "Faktura ikke fundet" — teksten findes ikke i nuværende kode, stammer fra ældre deploy). **0 sendt.** |
| supplier-sync | **0 planer** i `supplier_sync_schedules` → ingen effekt i dag. |
| lemu-sync | 8 × `ftp completed` seneste 60 dage (ugentlig) — virker. |
| email-sync | `graph_sync_state` success 05:01 i dag. crm@-postkassen er stale (~50 t) ifølge health-log. |
| system_health_log | Daglige warnings: `bank` (ingen banktransaktioner 7 d), `economic` (ikke konfigureret), `email` (stale postkasse), `health_check` (admin-alarm uden modtagere). |

## Fund (ingen rettet — rettelse = aktivering i prod)

| # | Cron | Fund | Konsekvens i dag | Anbefalet rettelse (kræver Henriks beslutning) |
|---|---|---|---|---|
| F1 | supplier-sync | Bruger cookie-klient uden session (= anon). Planer, credentials og sync-logs læses/skrives ikke (RLS; `supplier_credentials` REVOKE fra anon i 00161). Returnerer 200 "No active sync schedules". | Ingen (0 planer). Bliver et problem først når en plan oprettes. | `createAdminClient` i route.ts:12/39 + supplier-api-client.ts:277/300. Aktiverer rigtige API/FTP-kald → **integration-gate**. |
| F2 | learning-feedback | Cookie-klient → 0 rækker. | Selvlæring kører ikke. | Admin-klient i learningEngine (kun intern data). |
| F3 | unanswered-mails-check | `'use server'`-fil med cookie-klient → 0 mails tjekket, 0 opgaver. | Ingen auto-opgaver for ubesvarede mails. | Admin-klient i auto-tasks.ts. Opretter interne opgaver → ændrer adfærd. |
| F4 | email-sync | `linkEmail` (email-linker.ts:392) bruger cookie-klient → kobling mail→kunde formentlig no-op under cron. | Mails hentes, men kobles ikke automatisk. | Admin-klient til linkeren. |
| F5 | lemu-sync | Exceptions skrives ikke til `supplier_sync_logs`. | Var usynlige. **Nu synlige via cron-log.** | (evt. også `failed`-række i supplier_sync_logs) |
| F6 | invoice-reminders | Ingen on/off-kontakt for kundemails. | 0 sendt (se ovenfor). | Env/indstillings-kill-switch. Standardværdien er en forretningsbeslutning. |
| F7 | offer-reminders | Kontakt findes, men default er TIL (`?? true`) og TIL i prod. | 0 sendt seneste 30 dage. | Bekræft at automatiske kunderykkere ønskes under piloten. |

## Beslutninger til Henrik (BLOCKED i backlog)
1. **Kundemail-crons (F6/F7):** skal automatiske tilbuds- og betalingsrykkere være aktive under piloten? De har ikke sendt noget de seneste 30 dage, men kan gøre det uden varsel, når et tilbud eller en faktura bliver berettiget.
2. **Anon-crons (F1–F4):** skal de rettes? Hver rettelse aktiverer adfærd i prod. F1 er desuden en integration-gate.

## Incident-relation
P-003 (INCIDENT_LOG) udvidet: samme rodårsag (cookie-klient i cron) gælder også F2–F4.
