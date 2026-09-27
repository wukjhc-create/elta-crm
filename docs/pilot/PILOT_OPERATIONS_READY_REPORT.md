# ELTA CRM — Pilot Operations Ready-rapport

**Dato:** 2026-09-27 · **Konklusion: 🟢 PROD READY** — 00160 og 00159 er kørt og verificeret i production (2026-09-27).
**Næste skridt:** pilotbrugerne (navngivning + oprettelse med korrekte roller, §3).

<!-- tidligere status: 🟡 KLAR med sikkerhedsgate — piloten kunne starte med admin-brugere;
ikke-admin først efter 00160. -->

| Område | Status | Kort |
|---|---|---|
| Pilotbrugere & roller | 🟡 | Rollemodel afklaret (P1 admin, P2 serviceleder, P3 montør/bogholderi); navne = Henriks valg |
| Roller/permissions (RLS) | 🟢 prod | 00160 kørt i prod 2026-09-27: 0 uventede huller, præcis forventet policy-sæt (16 policies, ingen skrive-`true`); rest-risici R1–R3 dokumenteret |
| Onboarding | 🟢 | Procedure pr. bruger (PILOT_OPERATIONS §2) |
| Workflow-tests | 🟢 | W1–W8 defineret; W1, W3–W6, W8 automatisk dækket på staging; W2/W7 manuelle ved onboarding |
| Incident-log | 🟢 | Proces S1–S4 + log; første post P-000 (RLS) |
| Rollback-plan | 🟢 | Stop-knapper, kode-, migrations- og data-rollback |
| Metrics/overvågning | 🟢 | `prod:pilot-health`, `prod:role-policies`, `prod:storage-audit` (alle read-only) |
| offers.source_case_id (00159) | 🟢 prod | Kørt i prod 2026-09-27 (kolonne, FK, 2 indexes, 0 backfill); `feat/offers-source-case-id` merget og deployet efterfølgende |

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

## 3. Production-udrulning (2026-09-27, godkendt af Henrik)
| Trin | Resultat |
|---|---|
| 00160 pre-check (read-only) | 8 åbne tabeller — som forventet |
| 00160 anvendt (`prod:apply-migration`, allowlist + godkendelsesflag, én transaktion) | ✅ COMMIT |
| 00160 post-check: `prod:role-policies` · `prod:verify-00160` | 0 uventede huller · præcis 16 forventede policies, ingen skrive-`true` |
| 00159 anvendt · post-check `prod:verify-00159` | ✅ kolonne + FK + 2 indexes, 15 tilbud uændrede, 0 backfill |
| Merge `feat/offers-source-case-id` → `main`, push (deploy) | ✅ efter fuld staging-regression på den mergede kode |
| Regression efter deploy | `prod:role-policies` 0 · `prod:verify-00160/00159` ✅ · `prod:storage-audit` 0 huller · `prod:pilot-health` 🟢 · staging security 21/21 · pilot 9/9 flows + 14/14 invarianter · rollematrix 0 uventede huller, montør/salg 0/8 indsættelser · typecheck/lint/build ✅ |

Bekræftet: ingen tilladt rolle har mistet nødvendig adgang (staging-måling, alle ✓-celler uændrede; bogholderi/admin
kan fortsat rette indgående fakturaer) · montør/salg kan ikke skrive til økonomitabellerne · alle 7 agents
disabled/suggest · `AUTO_CREATE_CASES_ENABLED` OFF · `vercel.json`-crons uændrede · ingen agent kaldes fra API/cron ·
eneste send-capability (`mail.send_reply`) er hard-blocked · ingen finance/delete-capabilities.

## 3b. Næste skridt (Henriks valg)
**Navngiv 2–3 pilotbrugere** (P2 serviceleder, P3 montør eller bogholderi) → oprettes via Indstillinger → Brugere med
korrekt rolle → onboarding (PILOT_OPERATIONS §2) → W2/W7 manuelt første gang.

## 4. Uændret
Alle agents disabled/suggest (prod + staging) · `AUTO_CREATE_CASES_ENABLED` OFF · ingen live kundemail ·
ingen cron-/event-autonomi · ingen finance/delete · ingen Relatel/SMS · ingen Floorplan/3D.
