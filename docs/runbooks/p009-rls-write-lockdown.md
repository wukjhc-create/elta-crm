# Runbook — P-009 RLS-skrivelås (runde for runde)

**Status:** ✅ **Runde 1–3B (00170–00174) KØRT i production 2026-10-01** (godkendt af Henrik). Rækkefølge 00170 → 00174.
- Pr. migration:
  - read-only pre-check,
  - trigger-audit med præcis de aktive runder,
  - apply,
  - post-check: ingen åbne skrive-policies, præcis de genererede policies, anon som designet, trigger-funktioner SECURITY DEFINER uden klient-EXECUTE, rolle-prædikater pr. prod-persona.
- **Effektiv skriveadgang** (`scripts/prod-rls-effective.ts`): de faktiske policy-udtryk er evalueret mod de rigtige rækker pr. persona (admin, montør) på 64 tabeller, og resultatet er som matrixen.
- **Afsluttende suite:**
  - `prod:db-audit` HØJ/MIDDEL 0 (LAV 44),
  - `prod:role-policies` 0·0·0, storage OK, pilot-health 🟢,
  - åbne skrive-tabeller 108→44,
  - verify-00161/62/63/66/67-68 grønne.
- **Sikkerhed:** agents 7/0/0, alle flag OFF, 0 kundemails, 0 finance-writes.
- **Note:** 00171-post-checket gav først 7 falske afvigelser. Fejlen lå i verifikationsscriptet, som forventede policies på tabeller, der bevidst kun skrives af service-role. Prod blev tjekket direkte og var som designet. Checket er rettet og nu strengere: policy skal mangle, når der ikke er roller.

## Næste gate: læse-side A1–A3 (00175–00177) + runde 4 (00178) — anvendt og verificeret på staging, IKKE i prod
| Migration | Hvad | Bevis (staging) |
|---|---|---|
| 00175 | `portal_access_tokens.token` og `partner_access_tokens.token` skjult (kolonne-grants). `messages` kun afsender og modtager | `harness:rls-read` FØR: alle 5 roller læste alle tokens og alle beskeder. EFTER: ingen. Status er stadig læsbar, og salg kan stadig oprette adgang |
| 00176 | `integrations.api_key/api_secret/oauth_*` skjult | FØR: alle læste. EFTER: ingen. Offentlige kolonner er læsbare |
| 00177 | `document_confirmations.token` skjult, så kundesamtykke ikke kan forfalskes. `offer_signatures` er ikke læsbar for bruger-sessionen | FØR: alle læste token og underskrift. EFTER: ingen |
| 00178 | Runde 4: 44 kalkulations-, katalog- og master data-tabeller | Metadata-genererede probe-rækker (`auto-spec.ts`). FØR: 44/44 med huller. EFTER: 44/44 som matrixen |

**Forudsætning, kode (pushet først, virker før og efter):**
- Token-læsning sker via service-role i gatede actions (`src/lib/portal/token-reader.ts`).
- Tokens returneres kun til `offers.send` (portal) og `settings.manage` (partner).
- Integrations-forespørgsler går via service-role.
- Bekræftelses-token hentes via service-role.

**Fund under runde 4:** generatoren droppede kun policies med betingelsen `true`. Betingede policies (fx `calculations` INSERT `created_by = auth.uid()`) ville derfor blive stående og åbne igen, fordi permissive policies OR'es. Rettet tre steder:
- `calculations` er dækket.
- Pre-checket kræver nu, at ALLE skrive-policies er dækket.
- Generatoren bruger `prod-all-write-policies-json`.

For runde 1–3B beviste prod-post-checket ("ingen fremmede skrive-policies"), at intet er efterladt.

**Udførelse:**
- Hver migration køres for sig med det samme mønster: pre, apply, post.
- Til 00178 bruges `prod-verify-rls-wave.ts WAVE4`.
- Til 00175–00177 bruges `prod:role-policies` (de hemmelige kolonner er nu med i auditten) og `prod-sensitive-columns.ts`.

## Model
- **Én kilde:** `scripts/rls/write-matrix.ts`. Pr. tabel står de roller, der må INSERT/UPDATE/DELETE, plus evt. ekstra betingelser (fx `created_by = auth.uid()`, forslag-sletning).
- **Least privilege** betyder præcis de roller, som appen skriver med via bruger-sessionen:
  - Rollerne er AST-kortlagt med `scripts/rls-write-sites.ts`, inklusive kaldere, hjælpere og service-lag.
  - Service-role (cron, portal, sync) påvirkes ikke af RLS.
- Læsning (SELECT) ændres ikke. Anon mister alle tabel-grants.
- **Genereret SQL:** `npx tsx scripts/rls/build-migration.ts <nr> <WAVE>`.
- **CI (`npm run check:rls-matrix`)** fejler, hvis:
  - app-kode skriver som en rolle, matrixen ikke tillader (lockdown ville bryde et flow),
  - en migrationsfil er drevet fra matrixen.
- **Staging-bevis (`npm run harness:rls-lockdown -- <WAVE>`):**
  - rigtige rolle-sessioner (5 personaer) + anon,
  - pr. tabel: INSERT/UPDATE/DELETE, både positive og negative,
  - ekstra betingelser,
  - læsning uændret.

## Runde 1 — 00170
| Tabel | INSERT | UPDATE | DELETE |
|---|---|---|---|
| customers | admin, serviceleder, salg, montør¹ | admin, serviceleder, salg | admin |
| customer_contacts | admin, serviceleder, salg, montør¹ | admin, serviceleder, salg | admin, serviceleder, salg |
| offers | admin, serviceleder, salg + `created_by = uid` | admin, serviceleder, salg | admin; serviceleder/salg kun `is_proposal` |
| offer_line_items | admin, serviceleder, salg | admin, serviceleder, salg | admin, serviceleder, salg |
| portal_access_tokens | admin, serviceleder, salg + `created_by = uid` | admin, serviceleder, salg | admin |
| customer_documents | alle 5 roller² | admin, serviceleder, montør, salg | admin |
| incoming_emails | admin, serviceleder, montør, salg | alle 5 roller³ | admin |

¹ opret kunde/kontakt fra mail (`inbox.view`) · ² upload er `customers.view` · ³ læst-markering fra kundekortet er `customers.view`.

**Målt på staging:**
- `harness:rls-lockdown` WAVE1: 7/7 tabeller, 172 checks med rigtige sessioner.
- Regression grøn:
  - `security`, `pilot-roles`, `flows`, `agent-gating`, `agent-actions`, `exemption-proofs`, `action-auth`,
  - `invoice-*`, `supplier-*`,
  - `db-audit` HØJ/MIDDEL 0 (LAV 108→101).

**Pre-check prod (read-only):** `npx tsx scripts/prod-verify-rls-wave.ts WAVE1 pre`
- 14 åbne skrive-policies på 7/7 tabeller, og alle droppes af migrationen.
- Anon-grants på `customer_contacts` og `incoming_emails`.

## Runde 2A — 00171 (finance/arbejdsordrer, integrationer, automation, skabeloner)
| Tabel | INSERT | UPDATE | DELETE |
|---|---|---|---|
| invoice_lines, invoice_predecessors, work_order_profit, integration_queue, automation_executions, sms_templates | — | — | — |
| work_orders | admin, serviceleder | admin, serviceleder; **montør kun → status `done`** | admin, serviceleder |
| time_entries | admin; serviceleder/montør **kun egne** | admin; serviceleder/montør kun egne | admin; serviceleder/montør kun egne |
| integrations, integration_endpoints, automation_rules | admin | admin | admin |
| integration_webhooks | admin | admin, serviceleder, salg (tællere) | admin |
| integration_logs | admin, serviceleder, salg | — (append-only) | — |
| external_references | admin, serviceleder, salg | admin, serviceleder, salg | admin |
| email_templates | admin, serviceleder | admin, serviceleder | admin, serviceleder |

"—" betyder ingen policy: kun service-role skriver, og REST-skrivning er afvist for alle.

**Trigger-fund (`scripts/prod-trigger-writes.ts`, transitiv):** `work_orders` → done og `invoices` skriver profit-snapshot **som brugeren**. Uden rettelse ville montør ikke kunne afslutte en arbejdsordre, og ingen ville kunne oprette fakturaer via bruger-klienten. Rettelse i 00171:
- Trigger-funktionerne `trg_work_order_done_snapshot_profit` og `trg_invoice_snapshot_profit` er `SECURITY DEFINER` med låst `search_path`.
- EXECUTE er revoked, så de ikke kan kaldes direkte. EXECUTE tjekkes kun ved CREATE TRIGGER.
- `snapshot_work_order_profit()` forbliver INVOKER, så et direkte RPC-kald stadig afvises af RLS.

**App-rettelse:** `updateTimeEntry` og `deleteTimeEntry` håndhævede ikke "egne" (`time.edit_own`). Nu gør de, og admin (`time.edit_all`) kan stadig alle.

**Målt på staging:**
- `harness:rls-lockdown -- WAVE2A`: 15/15 tabeller, 339 checks, inkl. montør→done, egne timer og fremmed `user_id` afvist.
- `db-audit`: HØJ 0, LAV 101→86.
- Regression grøn.

**Pre-check prod:** `npx tsx scripts/prod-verify-rls-wave.ts WAVE2A pre`
- 19 åbne skrive-policies på 15/15 tabeller, og alle droppes af migrationen.
- Anon-grants på 15 tabeller.

## Runde 2B — 00172 (leverandørprisdata)
| Tabel | INSERT | UPDATE | DELETE |
|---|---|---|---|
| supplier_products (~324k) | admin | admin | admin |
| supplier_product_cache | — | — | — |
| price_history | admin | — | — |
| supplier_sync_logs | admin | admin | — |
| supplier_sync_jobs, supplier_sync_schedules, supplier_margin_rules | admin | admin | admin |
| customer_supplier_prices | admin, serviceleder | admin, serviceleder | admin, serviceleder |
| customer_product_prices | admin, serviceleder | admin, serviceleder | — |
| import_batches | admin | admin | — |

**Forudsætning, kode (deployet først):** system-skrivninger med data fra leverandør-API'et kører nu som service-role inde i de allerede gatede actions:
- tilbudssøgningens auto-import,
- prisopdatering fra kalkulation,
- AO-mail-prishistorik,
- API-cache og fallback-cache.

Salg og serviceleder kan dermed ikke længere ændre de ~324k priser direkte via REST.

**Anon-grants bevares midlertidigt** på `supplier_products`, `price_history`, `supplier_sync_logs` og `supplier_sync_schedules`. Grunden er, at supplier-sync-cron'en bruger anon-klienten (P-003, rettelse afventer Henrik), og en revoke ville ændre cron'ens adfærd fra tom læsning til fejl. RLS blokerer stadig al anon-skrivning (ingen anon-policies). Det er testet.

**Målt på staging:**
- `harness:rls-lockdown -- WAVE2B`: 10/10 tabeller, 210 checks.
- `prod-trigger-writes`: ingen brud.
- `db-audit`: LAV 86→76.
- Regression grøn.

**Pre-check prod:** 25 åbne skrive-policies på 10/10 tabeller, og alle droppes af migrationen.

## Anon-kontekster (P-003) — bevarede anon-grants
Nogle processer kører med cookie-klienten uden session, altså som anon: supplier-sync, unanswered-mails, rykker-resolverne og learning-feedback. De ser i dag 0 rækker. En anon-revoke på en tabel, de læser, ville skifte tom læsning til `permission denied` og dermed ændre cron-adfærd (fejllog, cron-status).
- `scripts/rls-write-sites.ts --anon-crons` kortlægger disse tabeller, inklusive læsninger.
- Tabellerne får `keepAnonGrants` i matrixen, og CI fejler, hvis en af dem mister anon-grants.
- RLS blokerer stadig al anon-skrivning, for der findes ingen anon-policies (testet i hver runde).
- Når P-003 er besluttet og crons bruger service-role, kan en afsluttende runde revoke anon overalt.

## Runde 3A — 00173 (sager, projekter, leads, tilbudstilbehør, underskrifter, beskeder, partner-tokens)
- **service_cases:** slet kun admin. Serviceleder og salg kun forslag (`is_proposal`).
- **case_notes:** montør kun egne noter (`created_by`), som `cases.edit.own`.
- **messages:** send som sig selv, og kun modtageren kan markere læst og slette. DELETE var åben for alle.
- **offer_signatures, sent_quotes, offer_package_items:** kun service-role. Medarbejdere kan ikke forfalske en digital underskrift via REST.
- **Trigger-fund:** `time_entries` opdaterer `projects.actual_hours` som brugeren, så montørs timeregistrering ville bryde. Derfor er `update_project_actual_hours()` nu SECURITY DEFINER, og EXECUTE er revoked.
- **Målt på staging:**
  - `harness:rls-lockdown -- WAVE3A`: 21/21, 489 checks.
  - `db-audit`: LAV 76→55.
  - Regression grøn.

## Runde 3B — 00174 (mail/SMS-log, mail-synk-tilstand, AI, mail-intelligens)
- **email_messages og email_threads:** tilbuds- og opgavemails (`offers.send`, `tasks.edit`).
- **graph_sync_state:** admin (mail-synkens delta-links).
- **Kun service-role:** events, SMS, AI-forslag, AI-forbrugstæller (budgetloftet kunne nulstilles via REST), AI-promptskabeloner (prompt-injektion via REST er lukket) og intelligens-log.
- **Trigger-fund:** `email_messages` opdaterer tråd-statistik som brugeren, så salgs tilbudsmails ville bryde. Derfor er `update_thread_stats()` og `update_thread_on_message_status()` nu SECURITY DEFINER, og EXECUTE er revoked.
- **Målt på staging:**
  - `harness:rls-lockdown -- WAVE3B`: 11/11.
  - Alle 5 runder grønne samlet.
  - `db-audit`: LAV 55→44.

## Tilbage (ikke låst endnu)
Kalkulation, katalog og konfiguration: `calc_*`, `kalkia_*`, `calculation_*`, `packages/package_*`, `product_*`, `materials*`, `solar_products`, `room_*`, `project_*`-skabeloner, `risk_*` m.fl. (~44 tabeller). Det er næste runde (4).

## Læse-side (opfølgning, ikke i disse runder)
SELECT er bevidst uændret. Men disse tabeller har hemmeligheder eller private data, der kan læses af alle indloggede:
- `portal_access_tokens.token`,
- `partner_access_tokens.token`,
- `integrations.api_key/api_secret/oauth_*` (0 rækker i prod),
- `messages` (alle interne beskeder).

Det kræver en separat læse-runde med kolonne-grants og ejer-policies.

## Udførelse (efter godkendelse)
1. Tilføj `'00170'` (og `'00171'`) til allowlist i `scripts/prod-apply-migration.ts`. Kør én runde ad gangen, og efter hver runde: `npx tsx scripts/prod-trigger-writes.ts` → ✅.
2. `npx tsx scripts/prod-verify-rls-wave.ts WAVE1 pre` → ✅
3. `npm run prod:apply-migration -- 00170 --approved-by-henrik`
4. `npx tsx scripts/prod-verify-rls-wave.ts WAVE1 post`. Tjekker:
   - ingen åbne skrive-policies,
   - anon har 0 grants,
   - de genererede policies findes,
   - rolle-prædikaterne pr. prod-persona er som matrixen.
5. Kør `prod:db-audit`, `prod:role-policies`, `prod:pilot-health` og `scripts/prod-write-policies.ts`. Tallet skal falde med 7 tabeller.
6. Smoke-test som montør:
   - åbn mail og opret kunde fra mail (skal virke),
   - prøv at rette en kunde (skal afvises, som i appen).

## Rollback
Genskab de droppede policies (navne står i DROP-linjerne) som `USING (true)` / `WITH CHECK (true)` for authenticated.
