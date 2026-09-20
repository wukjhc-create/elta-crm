# ELTA CRM Test Harness — Arkitektur (fundament)

> Status: **FUNDAMENT**. Selve års-simulationen (data-generering) er bevidst
> IKKE implementeret endnu — den bygges først, når en dedikeret, sikker
> staging/test-database er etableret og verificeret ikke-prod.
> Kode: `scripts/test-harness/`. Sidst opdateret: 2026-09-20.

Test Harness er et værktøj til at **simulere realistisk drift** og **finde
problemer automatisk** — ikke en simpel unit-test-suite.

## 1. Sikkerhedsmodel (vigtigst)

Harness må **aldrig** generere/mutere data mod production.

- **`env-guard.ts` → `assertSafeHarnessTarget()`** kaldes FØRST i generator og
  scenario-runner. Den **hard-blokerer** medmindre alle gælder:
  - `HARNESS_SUPABASE_URL` er sat og **≠** production URL/ref
  - `HARNESS_SUPABASE_SERVICE_ROLE_KEY` er sat
  - `HARNESS_CONFIRM === 'I_UNDERSTAND_TEST_ONLY'`
  - `NODE_ENV ≠ production`
  - URL ligner test/staging (medmindre `HARNESS_ALLOW_ANY=true` bevidst)
- Da intet af dette er sat i dag, **kan harness ikke skrive data** — præcis det
  ønskede, indtil staging er sikkert på plads.
- `evaluateHarnessTarget()` er ren og enhedstestet (blokering + tilladelse).

## 2. Komponenter

| Fil | Rolle |
|---|---|
| `env-guard.ts` | Safeguard mod prod (kritisk) |
| `types.ts` | Kontrakter: `GeneratorConfig`, `InvariantCheck`, `HarnessReport`, `ScenarioStep`, `SYNTHETIC_TAG` |
| `invariants.ts` | Katalog af invariant-checks (SQL der returnerer violerende rækker; forvent 0) |
| `runner.ts` | `runInvariants()` (read-only) + `formatReport()` |
| `generator.ts` | Data-generator (skelet; guard først; **kaster indtil implementeret**) |
| `scenario-runner.ts` | Scenarier: fejl/samtidighed/permission (skelet; guard først) |
| `index.ts` | Public entry |

## 3. Generator (planlagt)

Deterministisk (fra `seed`) simulering af **mindst 12 måneders drift**, **100–200
nye kunder/måned**, med afledte: leads, sager, tilbud, mails, dokumenter,
portalaktivitet, statusændringer, medarbejderhandlinger, Agent Core
proposals/approvals, **fejlscenarier** og **samtidige handlinger**.

- **Syntetisk markering:** alle rows tagges `HARNESS_SYNTHETIC` + `seedRunId`, så
  de aldrig forveksles med rigtige data og kan ryddes deterministisk.
- **Reproducerbarhed:** samme seed → samme data.
- **Cleanup/reset:** slet alt med `SYNTHETIC_TAG`-filter for den givne seed.

## 4. Invariant-framework (find problemer automatisk)

`runInvariants(query, checks, target)` kører hver checks `violationSql` READ-ONLY
og bygger en `HarnessReport` (pass/fail pr. severity + samples). Nuværende
katalog dækker bl.a.:

- duplicate customers (email), duplicate offer_number
- orphan offer_line_items
- agent run/task/action-konsistens, **dobbelt agent-eksekvering**
- executed uden audit, **hard-blocked executed uden approval**
- stale approvals, dublet idempotency_key
- RLS enabled på agent-tabeller, anon-grants, agenter uventet enabled

Udvides løbende med: invalid state transitions, storage-access leaks, unexpected
data growth (metric), langsomme queries (metric), flere race-condition-checks.

Fordi checksne er read-only, kan `runInvariants` også bruges som generelt
health-check mod en hvilken som helst target-query — men **data-generering**
forbliver guard-beskyttet.

## 5. Scenario-runner (planlagt)

Navngivne scenarier der udfordrer systemet: samtidige approvals/executions,
dobbelt mail-processing, permission/RLS-forsøg som non-admin, fejl-injektion i
transport, m.m. Opsamler metrics (performance, race-udfald) til rapporten.

## 6. Rapportformat

`HarnessReport` (JSON) + `formatReport()` (tekst): target (maskeret ref, aldrig
secret), tid, antal checks, pass/fail, fail pr. severity, og pr. check status +
violation-count + sample.

## 7. Sådan tages næste skridt (kræver beslutning)

1. Etablér en **dedikeret staging-Supabase** (separat projekt/ref).
2. Sæt `HARNESS_SUPABASE_URL`, `HARNESS_SUPABASE_SERVICE_ROLE_KEY`,
   `HARNESS_CONFIRM=I_UNDERSTAND_TEST_ONLY` i et lokalt, ikke-committet env.
3. Implementér `generator.ts` + `scenario-runner.ts` (skriver kun til staging;
   alt tagget synthetic).
4. Kør invariant-suiten mod staging efter simulering; iterér.

Indtil da er fundamentet på plads, testet, og **kan ikke røre production**.

## 8. Staging — arkitektur & krævede env-variabler (setup-gate)

**Nuværende arkitektur:** ét Supabase-projekt (prod, ref `guhsjw…`) + Vercel (ingen preview/staging-env i `vercel.json`). Supabase CLI-config findes (`supabase/config.toml`, `seed.sql`). Der er **intet** staging-miljø i dag.

**Staging etableres sådan (kræver dine credentials — se gate nedenfor):**
1. Opret et **nyt, separat Supabase-projekt** ("elta-crm-staging"). Det giver: ny `URL`, `anon key`, `service_role key`, projekt-ref og en Management API `access token`.
2. Anvend **samme migrationer** som prod: kør `supabase/migrations/00000…00158` mod staging (samme RLS/policies/functions/triggers følger med, da de ér migrationerne).
3. Anvend **samme storage-buckets** (attachments/service-case-files/portal-attachments, alle private) — via migrationer/CLI.
4. **Ingen prod-data** kopieres. Kun harness-genererede syntetiske data (tagget `HARNESS_SYNTHETIC`).
5. Sæt harness-env i en **lokal, ikke-committet** fil (ikke `.env.local`, for at undgå prod-fallback). Credentials er **opdelt** så runtime-simulation ALDRIG kræver management-token:

**A. BOOTSTRAP — kun schema/migrationer** (`assertBootstrapConfig`):
| Env-variabel | Formål |
|---|---|
| `HARNESS_SUPABASE_URL` | Staging URL (≠ prod) |
| `HARNESS_SUPABASE_SERVICE_ROLE_KEY` | Staging service-role |
| `HARNESS_SUPABASE_ACCESS_TOKEN` | **Management API** — kun til at anvende/verificere migrationer |
| `HARNESS_CONFIRM` | `I_UNDERSTAND_TEST_ONLY` |

**B. RUNTIME — generator/scenario-runner/load** (`assertRuntimeConfig`, **INTET management-token**):
| Env-variabel | Formål |
|---|---|
| `HARNESS_SUPABASE_URL` | Staging URL (≠ prod) |
| `HARNESS_SUPABASE_ANON_KEY` | RLS/permission-scenarier (anon/non-admin) |
| `HARNESS_SUPABASE_SERVICE_ROLE_KEY` | Data-generering/scenarier |
| `HARNESS_CONFIRM` | `I_UNDERSTAND_TEST_ONLY` |

**Hvornår management-token kan fjernes:** `HARNESS_SUPABASE_ACCESS_TOKEN` bruges KUN under bootstrap (migrationer). Når staging-skemaet er anvendt og verificeret, **fjern det igen** — runtime-simulationen (`generate`/`runScenarios`) kalder aldrig Management API.

**Fail-closed (hård):** ingen fallback til `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ACCESS_TOKEN` / `.env.local`-prod. Staging-url/ref må ikke matche prod. Runtime afviser hvis `HARNESS_SUPABASE_SERVICE_ROLE_KEY == production service-role`; bootstrap afviser hvis token/service == production. Mangler noget → stop.

**Secrets:** logges/committes/rapporteres ALDRIG. `maskSecret()` viser kun `set(len=N)`/`(unset)` i diagnostics — aldrig indhold.

**Vercel (valgfrit app-lag mod staging):** en Preview/branch-deployment kan pege på staging-Supabase ved at sætte de fire `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_ACCESS_TOKEN` som **Preview-scope** env i Vercel (ikke Production-scope). Det kræver ændring af Vercel-secrets → separat beslutning. Harness'en behøver det ikke (den rammer staging-DB direkte); det er kun hvis app-UI skal testes mod staging.

## 9. Stress-profiler & metrics (fundament)

- Profiler: `normal` (1×), `x5` (5×), `x10` (10×) — skalerer `customersPerMonth` (`stress.ts`).
- Metrics: `latencyStats` (min/max/mean/p50/p95/p99), `errorRate`, `timed()` (`metrics.ts`) — rene, testede.
- Sikkerheds-scenarier: 10 deklarative i `security-scenarios.ts` (non-admin/montør/anon mod beskyttet data, manipuleret customer_id, stale approval, dobbelt-eksekvering, ugyldigt portal-token, storage uden ret, disabled agent, hard-blocked uden approval) — alle `mustBeDenied`.
