# ELTA CRM — Autonom backlog

Arbejdsregel: en blocker stopper kun sin egen opgave (→ `BLOCKED` med præcist hvad der mangler); arbejdet fortsætter
med næste ikke-blokerede opgave. Cyklus pr. opgave: INSPECT → PLAN → IMPLEMENT → TEST → FIX → REGRESSION → COMMIT →
PUSH → DONE. Prod-migrationer kræver altid Henriks gate (forberedes, køres ikke). Floorplan/3D: PARKERET.

Status: `TODO` · `IN_PROGRESS` · `BLOCKED` · `DONE`

## P0 — Sikkerhed
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 1 | R1: salg må kun læse fakturaer efter besluttet adgangsmodel | DONE (staging) | Model SPRINT_7A own_cases (sag created_by); 00161 · prod → P0-gate |
| 2 | R2: time_logs ikke læsbar for alle authenticated | DONE (staging) | Scope = app case-scope (employee.profile_id/work_orders); skriv kun egen medarbejder+ordre; 00161 |
| 3 | R3: supplier_credentials ikke læsbar for almindelige brugere | DONE (kode i prod, DB staging) | Server-only secrets-modul + settings.suppliers-gate (pushet); kolonne-grants i 00161 |
| 4 | Security harness: R1–R4 kan ikke regressere (rigtige probe-rækker) | DONE | rls-residuals.ts (35 checks) + views + hemmelige kolonner i pilot-roles/prod:role-policies; scripts/security-static-test.ts |

## P1 — Pilot-robusthed
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 5 | Udvid audit af alle rollefølsomme tabeller | DONE (staging) | db-audit (T1–T4, F1–F3, V1) prod+staging; fund P-004 → 00162; anon-surface-probes i pilot-roles. 112 tabeller hvor alle indloggede kan skrive (T4, app-lag) → egen hærdnings-opgave |
| 6 | Test sessions, invitationer, deaktiverede brugere, rolleændringer | DONE | harness:session-lifecycle 7/7: signup-rolle ignoreres, ingen selv-eskalering, rolleændring live i aktiv session, deaktivering → login/refresh afvist og gyldigt token behandles som anon med det samme. Staging-paritet: auth-trigger on_auth_user_created tilføjet (harness:staging-parity) |
| 7 | Samtidige brugere/race conditions i centrale workflows | TODO | |
| 8 | Fejloplevelser og tomme states i pilotens vigtigste UI | TODO | |
| 9 | Logging/incident visibility | TODO | |
| 10 | Pilot Operations-dashboard/health så enkelt som muligt | TODO | |

## P2 — Agent Core
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 11 | Audit af alle capabilities mod approval/executor-model | TODO | |
| 12 | Udvid stale-state/idempotency/concurrency-tests | TODO | |
| 13 | Forbered næste agent-milepæl (ingen live send/cron/finance) | TODO | |
| 14 | Agent Inbox reviewer-UX (konkrete problemer) | TODO | |

## P3 — Næste produktmoduler (discovery/design)
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 15 | Relatel: teknisk discovery + integrationskontrakt (ingen rigtig SMS) | TODO | |
| 16 | Deterministic follow-up engine (design, ingen live automation) | TODO | |
| 17 | Grossist/KlarPris discovery (datamodel, prisimport, lager, rabatter, sammenligning) | TODO | |
| 18 | Profit Engine-datamodel (materiale + timer + overhead + DB → salgspris) | TODO | |
| 19 | Invoice Control pipeline (design) | TODO | |

## Blokerede opgaver uden for nummerering
| Opgave | Status | Mangler |
|---|---|---|
| P1-gate: prod-migration 00162 (anon-eksponering, P-004) | BLOCKED | Henriks godkendelse. Runbook: docs/runbooks/00162-anon-exposure-lockdown.md. HØJ prioritet. |
| P0-gate: prod-migration 00161 (R1–R4) | DONE | Kørt i prod 2026-09-27 (godkendt). prod:role-policies 0·0·0; prod:verify-00161 struktur + adfærd (admin/montør) grøn. |
| Pilotbrugere oprettes og onboardes | BLOCKED | Henrik: navne + rolle for 2–3 pilotbrugere (P2 serviceleder, P3 montør/bogholderi) |

## Fund registreret undervejs
- P-004 (S1) anon kunne læse 310k leverandørpriser via view + forfalske audit (→ 00162).
- P-001 getDecryptedCredentials var ugatet server action (rettet i kode) · P-002 v_recent_audit_logs omgik RLS (R4, i 00161) · P-003 supplier-sync-cron bruger anon-klient (→ #9).

## Log
- 2026-09-27: P1 #5 db-audit færdig; P-004 fundet, 00162 forberedt (gate).
- 2026-09-27: 00161 kørt i prod (godkendt) og verificeret; P0 lukket.
- 2026-09-27: P0 #1–#4 færdige på staging; 00161 forberedt (gate).
- 2026-09-27: backlog oprettet (Henrik). Forudgående: 00159 + 00160 kørt i prod, Pilot Ops PROD READY.
