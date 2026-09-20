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
