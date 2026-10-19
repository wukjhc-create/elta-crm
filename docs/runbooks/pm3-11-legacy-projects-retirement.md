# PM3-11: det gamle Projekter-modul afvikles (Henrik 2026-10-19)

Beslutning: modulet afvikles. Sagerne (`service_cases`, ruterne `/dashboard/orders`) er sandheden. Der bygges ingen ny funktionalitet i det gamle modul. Hvor der findes links, laves redirects.

Prod-data fra tidligere optællinger (`scripts/prod-legacy-projects.ts`):
- 1 projekt
- 1 projektopgave
- 0 time_entries
- 0 beskeder med projekt

Optællingen køres igen før tabellerne droppes.

## Fase 1: kode, ingen DB-ændring

| Område | Fund | Handling |
|---|---|---|
| Ruter | `projects/page.tsx` redirecter allerede til /dashboard/orders | Behold redirect |
| Ruter | `projects/[id]/page.tsx` og `project-detail-client.tsx` (opgaver, time_entries, feedback) | Erstattes af redirect til /dashboard/orders. Klientkomponenterne slettes. |
| Komponenter | `components/modules/projects/*` (kun brugt af detaljesiden) | Slet |
| Ctrl+K | `command-palette.tsx` henter projekter og har sektionen "Projekter" | Fjern (sager er søgbare) |
| Global søgning | `search.ts` henter projekter og laver url /dashboard/projects/… | Fjern blokken |
| Kundekort | `customer-activity-overview.tsx`: "Projekter (gammel model)" via getCustomerProjects | Fjern sektionen og actionen |
| Kundeflow | `customer-flow.ts` montagetrin læser projects | Omskrives til service_cases |
| Beskeder | `messages.ts`: projekt-join, -filter og -vælger. message-form (projektfelt) | Fjern feltet i UI og joinet. DB-kolonnen bliver (SET NULL). |
| Integrationer | `buildProjectWebhookPayload` og webhook-ruten opdaterer `projects.status` | Fjern projektgrenen. Indgående projekt-payloads ignoreres og logges. |
| Læring | `collectProjectFeedback`, `getLearningSystemStatus` (tæller projekter), cron learning-feedback/`collectFeedbackFromProjects` | No-op eller rebasering på sager/time_logs |
| Auto-project | `recordCalculationFeedback` gates med `projects.edit` | Ny gate (tools.calculations) før projects.* fjernes |
| Portal | `revalidatePath('/dashboard/projects')` | Fjern linjen |
| Actions | `lib/actions/projects.ts` (alle eksporter kun brugt af modulet), `types/projects.types.ts`, `validations/projects.ts` | Slet |
| Rettigheder | `projects.view`, `projects.create`, `projects.edit`, `projects.delete` | Fjern når der ikke er flere kaldere |
| Eksport/rapporter | `exportProjects` er allerede på service_cases. Rapport- og dashboardfelter hedder "projects", men er sager. | Behold. Etiketten "Eksportér projekter" ændres til "sager". |
| Tests | U70 (ingen projekt-links) og U101/U102 (rute-crawl inkl. /dashboard/projects) | Behold. Crawlen forventer redirect. |

## Fase 2: DB-migration, kræver egen godkendelse

FK'er der peger på `projects(id)`:
- `messages.project_id` (SET NULL)
- `integration_logs.project_id` (SET NULL)
- `integration_queue.project_id` (SET NULL)
- `calculation_feedback.project_id` (ingen ON DELETE, blokerer)
- `project_tasks` og `time_entries`

Migrationen dropper FK-kolonnerne og constraints og derefter tabellerne `projects`, `project_tasks` og `time_entries`. Bagefter trimmes `rls-lockdown.ts`, `write-matrix.ts` og tabellisterne i prod-scripts.

**Forudsætning:** fase 1 er deployet, og en prod-optælling er gennemført. Prod-projektet arkiveres først, fx som en CSV/JSON-eksport til Henrik.
