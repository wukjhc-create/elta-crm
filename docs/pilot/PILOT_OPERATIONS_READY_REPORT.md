# ELTA CRM — Pilot Operations Ready-rapport

**Dato:** 2026-09-27 · **Konklusion: 🟡 KLAR, med én sikkerhedsgate** — piloten kan starte med **admin**-brugere nu;
**ikke-admin** pilotbrugere først når migration 00160 er godkendt og kørt i production.

| Område | Status | Kort |
|---|---|---|
| Pilotbrugere & roller | 🟡 | Rollemodel afklaret (P1 admin, P2 serviceleder, P3 montør/bogholderi); navne = Henriks valg |
| Roller/permissions (RLS) | 🔴→🟢 staging | Prod: 8 tabeller åbne for alle indloggede (læs + skriv). Rettelse 00160 verificeret på staging; prod afventer godkendelse |
| Onboarding | 🟢 | Procedure pr. bruger (PILOT_OPERATIONS §2) |
| Workflow-tests | 🟢 | W1–W8 defineret; W1, W3–W5, W8 automatisk dækket på staging, W6 efter 00160, W2/W7 manuelle |
| Incident-log | 🟢 | Proces S1–S4 + log; første post P-000 (RLS) |
| Rollback-plan | 🟢 | Stop-knapper, kode-, migrations- og data-rollback |
| Metrics/overvågning | 🟢 | `prod:pilot-health`, `prod:role-policies`, `prod:storage-audit` (alle read-only) |
| offers.source_case_id (00159) | 🟡 | Staging ✅; prod forberedt (runbook), kode på lokal branch til efter migration |

## 1. Hvad der er bygget
- **Rollemåling** `npm run harness:pilot-roles` (staging): 5 syntetiske personaer med ægte roller logger ind og
  forsøger direkte REST-læsning/-skrivning af 13 følsomme tabeller; probe-rækker sikrer at "0 synlige" betyder
  afvist, ikke tom tabel; positive/negative update-probes; kendte rest-risici rapporteres separat.
- **Prod read-only**: `prod:role-policies` (statisk RLS-analyse), `prod:pilot-health` (fejl pr. service, aktive
  brugere pr. rolle, agent-sikkerhed, aktivitet, alarmer). Delt `scripts/prod-readonly.ts`: prod-ref-lås,
  read-only session + `BEGIN READ ONLY` verificeret, kun enkelt-SELECT, ROLLBACK, maskerede fejl.
- **Harness-rettelse:** den syntetiske "montør" havde rollen `'montoer'` (ukendt rolle) — nu `'montør'`.
- Dokumenter: [PILOT_OPERATIONS.md](PILOT_OPERATIONS.md), [INCIDENT_LOG.md](INCIDENT_LOG.md),
  [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md), runbooks for [00159](../runbooks/00159-offers-source-case-id.md) og
  [00160](../runbooks/00160-rls-role-hardening.md).

## 2. Sikkerhedsgate: RLS (incident P-000)
Fundet i prod (read-only) med rigtige data: 5 fakturaer, 4 banktransaktioner, 53 indgående fakturaer og 2
leverandør-credentials kunne læses af **enhver** indlogget bruger, og 6 tabeller kunne også skrives. Prod har 2
montør-konti i dag (inaktive 7 dage). Løn/medarbejdere, audit og agent-data var korrekt beskyttet.

Den eksisterende security-test "montør læser økonomi" var **vakuøs** (tom tabel på staging) — rollematricen
seeder nu probe-data, så det ikke kan ske igen.

| Staging-måling | Før 00160 | Efter 00160 |
|---|---|---|
| Uautoriseret læsning | 14 | **0** |
| Uautoriseret indsættelse (montør/salg) | 8/8 | **0/8** |
| Tilladte roller der mistede adgang | — | **0** |
| Security / flows / invarianter | 21/21 · 9/9 · 13/13 | 21/21 · 9/9 · 13/13 |

**Rest-risici efter 00160 (kræver kodeændring, ikke blokerende for en intern pilot med kendte brugere):**
R1 salg læser alle fakturaer via REST · R2 tidsregistreringer læsbare for alle indloggede · R3 krypterede
leverandør-credentials læsbare (skrivning lukket). Anbefalet næste sikkerhedsmilestone: flyt disse læsninger til
server-side gatede stier og stram RLS pr. række.

## 3. Kræver Henriks beslutning
1. **Godkend og kør 00160** (prod) — runbook: `docs/runbooks/00160-rls-role-hardening.md`. Forudsætning for P2/P3.
2. **Godkend og kør 00159** (prod) — derefter merges `feat/offers-source-case-id` (valgfrit for pilotstart).
3. **Navngiv pilotbrugerne** og opret dem med korrekte roller.

## 4. Uændret
Alle agents disabled/suggest (prod + staging) · `AUTO_CREATE_CASES_ENABLED` OFF · ingen live kundemail ·
ingen cron-/event-autonomi · ingen finance/delete · ingen Relatel/SMS · ingen Floorplan/3D.
