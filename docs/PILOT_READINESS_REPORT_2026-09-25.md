# ELTA CRM — Pilot Readiness Report

**Dato:** 2026-09-25 · **Target:** staging `shatvntcfwxoxqadwnwu` · **Production:** ikke berørt (hard-blocked)
**Rå rapport:** `harness-reports/pilot-2026-09-25T15-00-03-389Z.json` (lokal, gitignored)

## Konklusion

| Område | Status | Kort |
|---|---|---|
| Persistent 12-mdr datasæt | 🟢 | seed=`pilot` bevaret og genbrugt (1805 harness-kunder, 596 tilbud, 2709 agent-runs) |
| UI/workflow-verifikation | 🟢 | 9/9 flows |
| Invarianter | 🟢 | 13/13 (0 critical/high fejl) |
| Sikkerhedsscenarier | 🔴 | 17/18 — `storage_access_no_right` fejler **på staging** (paritetshul, se nedenfor) |
| Agent-sikkerhed | 🟢 | 7 agent_configs, enabled=0, safety_mode=`suggest` |
| `AUTO_CREATE_CASES_ENABLED` | 🟢 | OFF (dev- og production-env lokalt; `npm run safety:flags`) |
| Production-beskyttelse | 🟢 | selftest: alle prod-cases + app-env-binding hard-blocked |

**Samlet: YELLOW/RED-gate.** Alt app- og DB-lag er grønt. Én blocker skal lukkes før
pilot-sign-off: staging-storage matcher ikke production, så storage-sikkerheden kan
ikke verificeres på staging endnu.

## 1. Datasæt (persistent)
- `npm run harness:pilot` genbruger datasættet (≥100 pilot-kunder) — ingen cleanup.
- Ingen `harness:cleanup` kørt (efter aftale).

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

## 3. Sikkerhedsscenarier
Alle 10 katalog-scenarier (`security-scenarios.ts`) eksekveres nu mod staging.
De 5 der manglede er implementeret i `scripts/test-harness/app-layer-scenarios.ts`
og kører **rigtig app-kode** (executor, capability-handler, portal-validering, storage-klient):

| Scenarie | Resultat |
|---|---|
| disabled_agent_execute | ✅ executor → `refused / agent disabled`, status uændret, audit skrevet |
| duplicate_execution | ✅ executor → `noop`, ingen ændring, ingen ny audit |
| manipulated_customer_id_link | ✅ tamper + stale kandidatliste afvist i action-lag; handler afviser; mail uændret |
| invalid_portal_token | ✅ malformet/ukendt/udløbet/inaktiv afvist 4/4; anon kan ikke enumerere tokens |
| storage_access_no_right | ❌ se blocker |

Sikring af app-lags-test: `bindAppEnvToStaging()` binder `createAdminClient()` til staging
efter guarden og kaster på prod-ref (dækket af selftest). Probe-actions bruger en ukendt
capability, så intet kan udføres selv hvis en agent ved en fejl var enabled. Alle probe-rows,
-tokens og -filer ryddes efter hvert scenarie.

## 4. BLOCKER — staging-storage-paritet

**Fund:** anon kan list/download/signere i `portal-attachments` på staging.
Årsag: policies `portal_customers_read_attachments` (SELECT) og
`portal_customers_upload_attachments` (INSERT, qual=true → alle buckets) findes på staging.

**Vurdering:** staging blev bygget fra et `public`-schema-dump; storage-migrationerne er
ikke anvendt. Production fik 00132 kørt og verificeret (commit `8a2d462`: begge anon-policies
droppet, anon upload/read blokeret). Staging mangler desuden buckets `attachments`
(00113) og `service-case-files` (00066/00133).
**Production er ikke verificeret direkte i dette forløb** (harness må ikke røre prod).

**Forslag (kræver godkendelse — DDL på STAGING, ikke prod):**
1. Anvend storage-delen af 00113, 00132, 00133 + opret `service-case-files` (private) på staging.
2. Kerne fra 00132:
   ```sql
   DROP POLICY IF EXISTS "portal_customers_upload_attachments" ON storage.objects;
   DROP POLICY IF EXISTS "portal_customers_read_attachments" ON storage.objects;
   ```
3. Kør `npm run harness:security` → forventet 18/18.
4. Anbefalet: read-only verifikation af prod-storage-policies (`pg_policies` for
   `storage.objects`) udført af dig — bekræfter at prod ikke har samme hul.

## 5. Ændringer i dette forløb
- `scripts/safety-flags.ts` + `npm run safety:flags` — rapporterer kun ON/OFF, exit 1 ved ON.
- `scripts/test-harness/app-layer-scenarios.ts` — 5 nye scenarier.
- `env-guard.ts` — `bindAppEnvToStaging()` (fail-closed på prod-ref).
- `cli.ts` — security printer resultater; status viser agent_configs; `skipped` tæller ikke som gate-fejl;
  ny `harness:seed-reference` (idempotent seed af `agent_configs` præcis som migration 00156).
- Staging-data: `agent_configs` seedet (7 rækker, alle disabled/suggest). Intet andet ændret.

## 6. Ikke udført (bevidst)
Ingen prod-write/-migration, ingen kundemail, ingen cron-autonomi, ingen agent aktiveret,
ingen Floorplan/3D, Relatel/SMS. Syntetiske staging-data bevaret.
