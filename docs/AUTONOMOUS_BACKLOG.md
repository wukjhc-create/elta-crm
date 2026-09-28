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
| 7 | Samtidige brugere/race conditions i centrale workflows | DONE | harness:concurrency 6/6 (stabil 5 koersler): parallel executeAction, runOfferAgent, handler (UNIQUE source_case_id), tilbudsnumre, opfølgningsagent, kundenumre. **2 race-fejl fundet og rettet:** (a) tilbudsnummer: 4/8 samtidige oprettelser fejlede (3 forsøg, 3 generatorer helt uden retry) → alle 5 generatorer samlet i services/offer-number.ts, 10 forsøg m. jitter-backoff, retry kun ved nummer-kollision; kundenummer samme (10 forsøg). (b) runOfferAgent kunne give 2 aktive forslag pr. sag → idempotency-generation = antal inaktive forslag |
| 8 | Fejloplevelser og tomme states i pilotens vigtigste UI | DONE | **Permission denied:** 55 sider under menu-gatede moduler havde ingen server-guard (direkte URL → tom liste/rå fejl) → `ModuleGuard` + layout pr. modul (29 layouts), settings-hub viser kun personlige kort for ikke-admins. **Stale data:** godkend/afvis på allerede afgjort forslag gav "Godkendt"; udfør på afgjort gav "Udført" → decision-guard + info-toast. **Recovery:** global-error.tsx (root-layout-fejl gav hvid side). Tests: `npm run ui:guard-audit` (G1–G4 inkl. blindgyde-check menu↔guard) + `harness:ui-states` 3/3. Empty states fandtes allerede i pilot-lister |
| 9 | Logging, incident-synlighed, supplier-sync-cron (discovery) | DONE | Alle 15 crons pakket i `withCronRun` → hver kørsel i system_health_log (før: 1/15). Cron-register (`cron-registry.ts`) = vercel.json (`ops:cron-check`). `harness:cron-log` 6/6. Read-only prod-måling: 0 kundemails fra crons seneste 30 d; supplier-sync har 0 planer; 3 andre crons er stille no-ops (anon-klient). Intet aktiveret. Rapport: docs/pilot/CRON_DISCOVERY.md |
| 10 | Pilot Operations-dashboard/health så enkelt som muligt | DONE | `/dashboard/pilot-health` (admin, read-only): 7 sektioner — system, crons (seneste kørsel/forsinket/kendte fund), brugere pr. rolle, agenter+sikkerhedsflag, åbne incidents, integrationer (mail/e-conomic/bank/leverandør), **live anon-prober** (SELECT-only). Hver sektion fejler isoleret. `harness:health-snapshot` 7/7 inkl. detektion (aktiveret agent → rød, cron-fejl → rød) og probe-rækker mod vakuøse resultater. Incident-register synkront med INCIDENT_LOG (`ops:incident-check`). |

## P2 — Agent Core
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 11 | Audit af alle capabilities mod approval/executor-model | DONE | 4 defense-in-depth-huller lukket i Executor: klasse/approval/ejer udledes af capability-registeret (rækken kan kun skærpe), ejerskab `agentTypes`, approvals genverificeres efter claim; registrering kaster ved skrivende klasse uden approval. `harness:agent-gating` 8/8 (inkl. positiv kontrol). Fund: `mail.send_reply` uden producent (→ #13); DB-trigger-hærdning = DDL-gate. Rapport: docs/agent-capability-audit.md |
| 12 | Udvid stale-state/idempotency/concurrency-tests | DONE | Matrix for alle 7 capabilities (samtidig udførelse, gentagelse, stale, samtidige forslag). **Fejl fundet+rettet:** `mail.link_customer` overskrev en manuel kobling til en anden kunde → atomisk betinget UPDATE. Hængende `executing` vises nu rødt i Pilot Health. `harness:agent-actions` 7/7 + link-unit 9/9. Se docs/agent-capability-audit.md |
| 13 | Forbered næste agent-milepæl (ingen live send/cron/finance) | DONE | Fase 6 forberedt: planlægningsagent `planning.propose_work_order` (intern arbejdsordre efter approval; dato+montør efter belastning; ingen besked, ingen cron; disabled). Unit + `harness:planning-flow` 6/6. Roadmap/live-gates opdateret (send_reply-producent + scope-model som krav før live). |
| 14 | Agent Inbox reviewer-UX (konkrete problemer) | DONE | 6 konkrete fund rettet i Agent Inbox. Fejlede/uvisse forslag viser nu årsagen på dansk ("Hvorfor: Forslaget er forældet: …"). "Godkend" vises ikke efter godkendelse. "Udfør" er slået fra (med forklaring) før godkendelse og når agenten er slået fra. Hvert run viser "agent aktiv/slået fra". needs_verification og hængende udførelse har en advarsel om ikke at gentage. Titler, status og afvisningsårsager er på dansk. Regler i `inbox-presentation.ts` + `agent-inbox-ux-test` (inkl. drift-vagter: alle capabilities/statusser har labels). **P2 komplet.** |

## P3 — Næste produktmoduler (discovery/design)
| # | Opgave | Status | Note / blocker |
|---|---|---|---|
| 15 | Relatel: teknisk discovery + integrationskontrakt (ingen rigtig SMS) | TODO | |
| 16 | Deterministic follow-up engine (design, ingen live automation) | TODO | |
| 17 | Grossist/KlarPris discovery (datamodel, prisimport, lager, rabatter, sammenligning) | TODO | |
| 18 | Profit Engine-datamodel (materiale + timer + overhead + DB → salgspris) | TODO | |
| 19 | Invoice Control pipeline (design) | TODO | |

## P2-rest (før P3)
| # | Opgave | Status | Note |
|---|---|---|---|
| A | DB-trigger-hærdning (capability-guard) | DONE (staging) · prod-gate | Migration 00163: `agent_capabilities` + `trg_agent_actions_capability_guard`, fail-closed på klasse/approval/agent/capability-ændring og executing uden approval. `harness:agent-gating` 13/13; testfixtures med opdigtede capabilities rettet. Prod pre-check grøn. Runbook: docs/runbooks/00163-agent-capability-guard.md |
| B | `mail.send_reply`-producer | TODO | |
| C | Browser/UI-verifikation (Agent Inbox/Pilot Health) | TODO | |

## Blokerede opgaver uden for nummerering
| Opgave | Status | Mangler |
|---|---|---|
| Prod-migration 00163 (agent capability-guard) | BLOCKED | Henriks godkendelse (defense-in-depth; ikke akut — ingen agenter aktive) |
| P1-gate: prod-migration 00162 (anon-eksponering, P-004) | DONE | Kørt i prod 2026-09-28 (godkendt). db-audit HØJ 21→0; prod:verify-00162 grøn; P-004 lukket. |
| P0-gate: prod-migration 00161 (R1–R4) | DONE | Kørt i prod 2026-09-27 (godkendt). prod:role-policies 0·0·0; prod:verify-00161 struktur + adfærd (admin/montør) grøn. |
| Beslutning: kundemail-crons (offer-/invoice-reminders) aktive under pilot? | BLOCKED | Henrik. Ingen sendt seneste 30 d, men kan sende uden varsel; invoice-reminders har ingen kill-switch (CRON_DISCOVERY F6/F7) |
| Beslutning: ret anon-crons (supplier-sync, learning-feedback, unanswered-mails, email-linker) | BLOCKED | Henrik — rettelse aktiverer adfærd i prod; supplier-sync = integration-gate (CRON_DISCOVERY F1–F4) |
| Pilotbrugere oprettes og onboardes | BLOCKED | Henrik: navne + rolle for 2–3 pilotbrugere (P2 serviceleder, P3 montør/bogholderi) |

## Fund registreret undervejs
- P-004 (S1) anon kunne læse 310k leverandørpriser via view + forfalske audit (→ 00162).
- Offers-RLS: UPDATE/DELETE `USING (true)` for alle indloggede (montør kan slette tilbud via REST). Ikke eksponeret for anon. → vurderes i #11/RBAC-milestone (kræver DDL-gate).
- P-001 getDecryptedCredentials var ugatet server action (rettet i kode) · P-002 v_recent_audit_logs omgik RLS (R4, i 00161) · P-003 supplier-sync-cron bruger anon-klient (→ #9).

## Log
- 2026-09-28: P2-rest A: 00163 capability-guard på staging (prod-gate).
- 2026-09-28: P2 #14 Inbox reviewer-UX færdig. **P2 komplet.**
- 2026-09-28: P2 #13 næste milepæl (Fase 6 planlægningsagent) forberedt og testet, disabled.
- 2026-09-28: P2 #12 stale/idempotens/samtidighed for alle agent-actions (1 fejl rettet).
- 2026-09-28: P2 #11 capability-audit færdig (Executor hærdet).
- 2026-09-28: 00162 kørt i prod og verificeret; P-004 CLOSED. P2 startet.
- 2026-09-27: P1 #10 Pilot Health færdig. **P1 komplet** (#9/#10 med 2 Henrik-beslutninger BLOCKED).
- 2026-09-27: P1 #9 cron-synlighed + discovery færdig (intet aktiveret; 2 beslutninger til Henrik).
- 2026-09-27: P1 #8 UI-tilstande færdige (permission-guards, stale-beslutninger, global-error).
- 2026-09-27: P1 #7 race-tests færdige; 2 race-fejl rettet i kode (tilbuds-/kundenummer, dobbelt tilbudsforslag).
- 2026-09-27: P1 #5 db-audit færdig; P-004 fundet, 00162 forberedt (gate).
- 2026-09-27: 00161 kørt i prod (godkendt) og verificeret; P0 lukket.
- 2026-09-27: P0 #1–#4 færdige på staging; 00161 forberedt (gate).
- 2026-09-27: backlog oprettet (Henrik). Forudgående: 00159 + 00160 kørt i prod, Pilot Ops PROD READY.
