# ELTA CRM — Pilot Operations

**Periode:** 2–4 uger · **Brugere:** 2–3 interne · **Ejer:** Henrik (admin) · Status: se [PILOT_OPERATIONS_READY_REPORT.md](PILOT_OPERATIONS_READY_REPORT.md)

## 1. Pilotbrugere og roller
Rollerne er de eksisterende i `profiles.role` / `src/lib/auth/permissions.ts` — piloten indfører ingen nye.

| Pilotplads | Rolle | Hvorfor denne rolle | Må | Må ikke |
|---|---|---|---|---|
| P1 — Henrik | `admin` | Ejer, reviewer i Agent Inbox, godkender | alt, inkl. Agent Inbox, brugere, løn | — |
| P2 — service/planlægning | `serviceleder` | Sager, tilbud, planlægning, tid | kunder, sager (alle), tilbud (opret/send), fakturaer (se/opret/send), tid (alle), mail | løn, bank, brugere, markér betalt/kreditér |
| P3 — montør *eller* bogholderi | `montør` / `bogholderi` | Test af den mest begrænsede rolle (montør) eller økonomi-flowet | montør: egne sager/tid, se kunder · bogholderi: fakturaer, bank, e-conomic | montør: økonomi, tilbud, indstillinger · bogholderi: løn, sager-redigering |

Navne udfyldes af Henrik (forretningsvalg). Konti oprettes af admin via Indstillinger → Brugere (invitation);
rollen sættes server-side (00150 forhindrer at en bruger selv ændrer rolle).

**Gate:** ikke-admin pilotbrugere (P2/P3) må først onboardes, når RLS-stramningen (migration 00160, §4) er kørt
og `npm run prod:role-policies` viser 0 huller. Indtil da kan en indlogget ikke-admin læse og ændre fakturaer,
bank, integrations- og leverandør-credentials direkte via API'et (incident P-000).

## 2. Onboarding (pr. bruger, ~30 min)
1. Admin inviterer brugeren med korrekt rolle → brugeren sætter eget password (ingen delte passwords).
2. Gennemgå med brugeren: navigation for rollen, hvor data kommer fra, at **intet sendes til kunder automatisk**.
3. Brugeren kører sine workflow-tests (§3) på rigtige, ikke-følsomme sager sammen med Henrik første gang.
4. Brugeren ved hvordan en fejl rapporteres (§6) — skærmbillede + tidspunkt + hvad man forventede.
5. Admin noterer i INCIDENT_LOG hvis noget ved onboarding ikke virkede.

## 3. Realistiske workflow-tests (pr. rolle)
| # | Rolle | Workflow | Forventet | Automatisk dækning (staging) |
|---|---|---|---|---|
| W1 | serviceleder | Mail → kobl kunde → opret sag | sag med kunde og mail-historik | `flows: mail_flow, case_flow` |
| W2 | serviceleder | Sag → tilbud (manuelt) → linjer → send til kunde (**kun intern testkunde**) | tilbud sendt, status `sent` | `flows: offer_detail` |
| W3 | admin | Mail → "Kør Mailagent" → Agent Inbox → godkend link/sag | forslag; sag oprettet som forslag | `case_proposal_flow` |
| W4 | admin | Sag → "Foreslå tilbud (agent)" → Inbox | forslag; udførelse afvises (agent disabled) | `fase5_offer_flow` |
| W5 | admin | Inbox → "Kør opfølgningsagent" → redigér udkast | udkast gemt, **intet sendt** | `fase5_followup_flow` |
| W6 | montør | Se egne sager, registrér tid | kun egne sager/tid; ingen økonomi | `pilot-roles` (efter 00160) |
| W7 | bogholderi | Faktura → markér betalt / bank-match | status opdateret, audit-spor | manuel |
| W8 | alle | Kundeportal-link → kunde ser tilbud/besked | portal virker, ugyldigt token afvises | `invalid_portal_token` |

Staging-regression før hver prod-deploy i pilotperioden: `npm run harness:pilot`, `npm run harness:security`,
`npm run harness:pilot-roles`, `npm run type-check`, `npm run build`.

## 4. Roller/permissions — kendt gap og rettelse
App-politikken (`permissions.ts`) håndhæves i server actions; RLS skal håndhæve det samme, ellers kan en bruger
læse/skrive direkte via API'et. Status og måling: Ready-rapporten §2. Rettelse: migration
`supabase/migrations/00160_rls_role_hardening.sql` · runbook `docs/runbooks/00160-rls-role-hardening.md`.
Måling: `npm run harness:pilot-roles` (staging) og `npm run prod:role-policies` (prod, read-only).

## 5. Overvågning
| Hvad | Kommando / sted | Frekvens | Alarm |
|---|---|---|---|
| **Samlet overblik** (system, crons, brugere, agenter/flag, incidents, integrationer, live anon-prober) | **`/dashboard/pilot-health`** (admin, read-only) | dagligt | Samlet status 🔴 · enhver rød linje |
| Fejl pr. service, aktive brugere, agent-sikkerhed, aktivitet | `npm run prod:pilot-health` (read-only) | dagligt | ≥5 fejl/service/24t · agent enabled/ikke-suggest · fejlet/needs_verification agent-action |
| Rolleadgang (RLS vs. app-politik) | `npm run prod:role-policies` (read-only) | efter hver migration + ugentligt | ethvert hul |
| Storage-politikker | `npm run prod:storage-audit` (read-only) | ugentligt | ethvert hul |
| Sikkerhedsflag | `npm run safety:flags` | før hver deploy | `AUTO_CREATE_CASES_ENABLED: ON` |
| System-fejl i UI | `/dashboard/go-live` → "System fejl (24t)" (operatørpanel med handlinger — brug Pilot Health til at kigge) | dagligt | >0 fejl |
| Cron-kørsler | Pilot Health → Crons (hver kørsel logges i `system_health_log`, service `cron`) | dagligt | error · FORSINKET · kendt fund |
| Admin-mails | `admin-alerts` (eksisterende, fra `system_health_log`) | løbende | efter behov |

Alle prod-kommandoer kører i en read-only session (`scripts/prod-readonly.ts`) og kan ikke skrive.

## 6. Incidents
| Sev | Definition | Reaktion |
|---|---|---|
| S1 | Datatab, forkert data sendt til kunde, sikkerhedsbrud | Stop-knap (ROLLBACK_PLAN §1) straks; Henrik kontaktes; ingen ny deploy før årsag kendt |
| S2 | Rolle-/adgangsfejl, forkert beregning, workflow blokeret for en rolle | Samme dag; midlertidig workaround; rettelse inden næste deploy |
| S3 | Fejl med workaround, performance | Inden for ugen |
| S4 | Kosmetisk/ønske | Backlog |

Log i [INCIDENT_LOG.md](INCIDENT_LOG.md). Rollback: [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md).

## 7. Go / no-go for at starte piloten
- [x] Migration 00160 (RLS) godkendt, kørt, `prod:role-policies` = 0 huller (2026-09-27)
- [x] Migration 00159 godkendt og kørt, feature-branch merget (2026-09-27)
- [ ] `prod:pilot-health` 🟢 tre dage i træk
- [ ] Pilotbrugere navngivet og oprettet med korrekte roller
- [ ] Workflow-tests W1–W8 gennemført én gang sammen med Henrik
- [x] Alle agents disabled/suggest · `AUTO_CREATE_CASES_ENABLED` OFF · ingen live kundemail fra agenter (bekræftet 2026-09-27)
