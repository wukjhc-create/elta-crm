# ELTA CRM — Pilot Readiness Report

**Opdateret:** 2026-09-26 (første udgave 2026-09-25) · **Target:** staging `shatvntcfwxoxqadwnwu`
**Production:** kun READ-ONLY storage-audit; ingen skrivning, ingen migration, ingen DDL
**Rå rapport:** `harness-reports/pilot-2026-09-26T07-12-55-085Z.json` (lokal, gitignored)

## Konklusion: 🟢 GRØN

| Område | Status | Kort |
|---|---|---|
| Persistent 12-mdr datasæt | 🟢 | seed=`pilot` bevaret og genbrugt (1805 harness-kunder, 596 tilbud, 2709 agent-runs) |
| UI/workflow-verifikation | 🟢 | 9/9 flows |
| Invarianter | 🟢 | 13/13 (0 fejl på alle severities) |
| Sikkerhedsscenarier | 🟢 | **18/18** — alle 10 katalog-scenarier eksekveres mod staging |
| Storage (staging) | 🟢 | identisk med production (buckets + policies + RLS), 0 huller |
| Storage (production, read-only) | 🟢 | 0 huller; ingen 00035-anon-policies; alle 3 buckets private |
| Agent-sikkerhed | 🟢 | 7 agent_configs, enabled=0, safety_mode=`suggest` |
| `AUTO_CREATE_CASES_ENABLED` | 🟢 | OFF (dev- og production-env lokalt; `npm run safety:flags`) |
| Production-beskyttelse | 🟢 | selftest: alle prod-cases + app-env-binding hard-blocked |
| Typecheck / build | 🟢 | `type-check`, `harness:typecheck`, `next build` |

## 1. Datasæt (persistent)
`npm run harness:pilot` genbruger datasættet (≥100 pilot-kunder). Ingen `harness:cleanup` kørt.

## 2. UI/workflow-verifikation (data-laget appen bruger)
| Flow | Resultat |
|---|---|
| customer_detail | kunde m. sager, tilbud, mails, dokumenter |
| offer_detail | tilbudslinjer summerer (2 linjer, 25.581,00) |
| case_flow | 1271 sager |
| mail_flow | 5492 mails linket til kunde |
| portal_flow | 540 portal-beskeder |
| document_flow | 2542 dokumenter |
| agent_inbox | 2709 runs afventer approval |
| approval_gating | 0 hard-blocked actions udført uden approval |
| audit_trail | 1355 executed = 1355 audited |

## 3. Sikkerhedsscenarier (18/18)
DB/RLS-lag (13): anon/montør-læsning af agent-, faktura- og portaldata afvist; hard-blocked uden approval,
dublet-idempotency, udløbet approval, anon/montør-skrivning og manipuleret status-opdatering afvist; 0 agents enabled.

App-lag (`scripts/test-harness/app-layer-scenarios.ts`, kører rigtig app-kode):

| Scenarie | Resultat |
|---|---|
| disabled_agent_execute | executor → `refused / agent disabled`, status uændret, audit skrevet |
| duplicate_execution | executor → `noop`, ingen ændring, ingen ny audit |
| manipulated_customer_id_link | tamper + stale kandidatliste afvist i action-lag; handler afviser; mail uændret |
| invalid_portal_token | malformet/ukendt/udløbet/inaktiv afvist 4/4; anon kan ikke enumerere tokens |
| storage_access_no_right | 3 private buckets: anon **list/upload/download/sign afvist**; authenticated download **3/3 virker** |

`bindAppEnvToStaging()` binder `createAdminClient()` til staging efter guarden og kaster på prod-ref (selftest).
Probe-actions bruger en ukendt capability. Alle probe-rows, -tokens og -filer ryddes efter hvert scenarie.

## 4. Storage-paritet (tidligere blocker — lukket)

**Fund (2026-09-25):** staging havde 00035's anon-policies (`portal_customers_read_attachments`,
`portal_customers_upload_attachments`) og manglede buckets `attachments` + `service-case-files`. Årsag: staging blev
bygget fra et `public`-schema-dump; storage-migrationerne var aldrig anvendt.

**Production read-only audit** (`npm run prod:storage-audit`): pg-session med `default_transaction_read_only=on`,
`BEGIN READ ONLY` verificeret før første forespørgsel, kun faste SELECTs (`storage-audit.ts`), afsluttet med ROLLBACK,
ingen credentials i output. Resultat: RLS enabled; buckets `attachments` (25 MB), `portal-attachments` (10 MB),
`service-case-files` (10 MB) alle private; 7 policies, alle `authenticated`; ingen anon/public-policies.
Anon table-grants på `storage.objects` findes i prod (ejet af `supabase_storage_admin`, kan ikke revokes via
service-role — jf. commit `8a2d462`); RLS uden anon-policy blokerer, bekræftet af scenariet ovenfor.

**Rettelse (kun staging, godkendt):** `npm run harness:storage-parity` — dropper de to anon-policies, opretter de
manglende buckets med production's præcise grænser/mime-typer, sikrer private buckets og opretter production's
policies. Ingen andre schema-ændringer, ingen data. `npm run harness:storage-audit` → **identisk med production**.

## 5. Ændringer i forløbet
- `npm run safety:flags` — `AUTO_CREATE_CASES_ENABLED` ON/OFF, aldrig værdier; exit 1 ved ON.
- `npm run prod:storage-audit` — read-only production storage-audit (`pg` tilføjet som devDependency).
- `harness:storage-audit` / `harness:storage-parity` — staging-audit med diff mod prod-snapshot / staging-paritetsfix.
- `harness:seed-reference` — idempotent seed af `agent_configs` præcis som migration 00156.
- `app-layer-scenarios.ts`, `storage-audit.ts`, `bindAppEnvToStaging()`.
- Staging-data/-schema ændret: `agent_configs` (7 rækker, disabled/suggest) og storage-paritet. Intet andet.

## 6. Ikke udført (bevidst)
Ingen prod-write/-migration/-DDL, ingen kundemail, ingen cron-autonomi, ingen agent aktiveret,
ingen Floorplan/3D, Relatel/SMS. Syntetiske staging-data bevaret.

## 7. Næste milestone
Pilot-gaten er grøn på staging. Næste naturlige skridt kræver forretningsbeslutning: hvilke pilotbrugere og hvilket
første workflow (fx Agent Inbox i `suggest`-mode) der åbnes i production, og om `mail`-agenten må aktiveres i `suggest`.
