# ELTA CRM — Autonom backlog

Arbejdsregel: en blocker stopper kun sin egen opgave (→ `BLOCKED` med præcist hvad der mangler); arbejdet fortsætter
med næste ikke-blokerede opgave. Cyklus pr. opgave: INSPECT → PLAN → IMPLEMENT → TEST → FIX → REGRESSION → COMMIT →
PUSH → DONE. Prod-migrationer kræver altid Henriks gate (forberedes, køres ikke). Floorplan/3D: PARKERET.

Status: `TODO` · `IN_PROGRESS` · `BLOCKED` · `DONE`

## P0 — Sikkerhed
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 1 | R1: salg må kun læse fakturaer efter besluttet adgangsmodel | TODO | |
| 2 | R2: time_logs ikke læsbar for alle authenticated | TODO | |
| 3 | R3: supplier_credentials ikke læsbar for almindelige brugere | TODO | |
| 4 | Security harness: R1–R3 kan ikke regressere (rigtige probe-rækker) | TODO | |

## P1 — Pilot-robusthed
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 5 | Udvid audit af alle rollefølsomme tabeller | TODO | |
| 6 | Test sessions, invitationer, deaktiverede brugere, rolleændringer | TODO | |
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
| Pilotbrugere oprettes og onboardes | BLOCKED | Henrik: navne + rolle for 2–3 pilotbrugere (P2 serviceleder, P3 montør/bogholderi) |

## Log
- 2026-09-27: backlog oprettet (Henrik). Forudgående: 00159 + 00160 kørt i prod, Pilot Ops PROD READY.
