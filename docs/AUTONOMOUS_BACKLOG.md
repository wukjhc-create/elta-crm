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
| 15 | Relatel: teknisk discovery + integrationskontrakt (ingen rigtig SMS) | DONE (discovery + foundation) | docs/integrations/RELATEL_CONTRACT.md er baseret på den offentlige API-dokumentation. Fund: iframe-API'et er usigneret (kun `?number=`), `X-Frame-Options: DENY` + SameSite-cookies forhindrer indlogget iframe, og telefonformaterne er blandede. Foundation er bygget: nummer-normalisering, opkalds-opslag `/dashboard/cti?number=` (login + RLS), kontrakt-typer og en deaktiveret klient uden netværk. Tests: `relatel-test` + `harness:relatel-lookup` 3/3 + ui-e2e U6. **BLOCKED:** access-token + beslutning om trin 1–5 (CTI-side, opkaldslog, click-to-call, SMS-udbyder). |
| 16 | Deterministic follow-up engine (design, ingen live automation) | DONE (design + motor) | 10 tidsdrevne regler kortlagt med konflikter: parallel kundemail + agent på samme tilbud, 3 alders- og udløbsbegreber, UTC-crons, intet loft pr. kunde, samtidighedsrisiko. En ren deterministisk motor er bygget (dansk kalender, stabile nøgler, én regel pr. situation, loft på 1 kundepåmindelse pr. dag); unit-tests inkl. DST og determinisme. Read-only skygge mod prod fandt, at **fakturarykkere aldrig har virket** (anon-klient i mail-router, P-003-familien). Intet koblet på drift. docs/followup/FOLLOWUP_ENGINE_DESIGN.md |
| 17 | Grossist/KlarPris discovery (datamodel, prisimport, lager, rabatter, sammenligning) | DONE (discovery) + sikkerhedsfund rettet | docs/integrations/GROSSIST_DISCOVERY.md. KlarPris-benchmark er med. Prod: LM 322k produkter (friske), AO 1,3k (7 mdr. gammel), 564 EAN hos begge, **0 prishistorik** (CHECK afviste FTP-kilder → 00165), 0 aftaler/lager. **P-005 (S3):** 50 pris-/leverandør-actions var ugatede, og `materials.ts` var service-role uden login. Gates er tilføjet i kode, og audit `security:actions` = 0 ugatede i domænet / 0 eksponerede uautentificerede. `supplier_settings` er låst på staging (00164). `harness:supplier-lockdown` 5/5, pilot-roles grøn. Resten af appen: 201 skrivende actions uden genkendt gate → egen RBAC-milepæl. |
| 18 | Profit Engine-datamodel (materiale + timer + overhead + DB → salgspris) | DONE (design + motor) | 4 divergerende prisalgoritmer er kortlagt. Den rene Profit Engine (`src/lib/profit/engine.ts`) adskiller indkøb (grossistrabat → nettokost) og salg (avance/mål-DB → kunderabat). DB beregnes altid på reel kost. Den har timer med risikobuffer, DB1/DB2 med overhead og advarsler; unit-tests er grønne. **Rettet:** send-gaten ignorerede tilbudsrabat (et tilbud med 30 % rabat kunne sendes med −14 % reel DB; latent, 0 tilbud med rabat) og `\|\|`-default i beregningsindstillinger. Datamodel-SQL er kun foreslået (ikke anvendt). docs/profit/PROFIT_ENGINE_DESIGN.md |
| 19 | Invoice Control pipeline (design) | DONE (design + motor) | Pipelinen er kortlagt. Prod: 53 leverandørfakturaer, kun 3 med linjer, 0 linjer koblet til produkt, så prisdækningen er **0 %**. Den rene kontrolmotor `controlInvoice` (tolerance, dækning, merbetaling; aldrig 'ok' uden data) har grønne tests. **Rettet (fejl på vejen mod e-conomic):** reparse kunne genåbne godkendte eller bogførte fakturaer (dobbelt-bogføring); en tabt godkendelses-race pushede alligevel; dubletkontrollen fandt altid fakturaen selv; og en materialepris-action var ugatet. `harness:invoice-pipeline` 4/4 (uden e-conomic). docs/invoice-control/INVOICE_CONTROL_DESIGN.md. **P3 komplet.** |

## P2-rest (før P3)
| # | Opgave | Status | Note |
|---|---|---|---|
| A | DB-trigger-hærdning (capability-guard) | DONE (prod 2026-09-29) | Migration 00163: `agent_capabilities` + `trg_agent_actions_capability_guard`, fail-closed på klasse/approval/agent/capability-ændring og executing uden approval. `harness:agent-gating` 13/13; testfixtures med opdigtede capabilities rettet. Prod pre-check grøn. Runbook: docs/runbooks/00163-agent-capability-guard.md |
| B | `mail.send_reply`-producer | DONE | Årsag: transportlaget blev bygget i Fase 3, og produceren blev bevidst udskudt. Den eneste prod-række var en intern test. Nu findes en sikker producer: "Forbered afsendelse" på et udført, udfyldt svarudkast opretter et forslag til afsenderen med "Re:". Den afviser skabelon-udkast og giver ét aktivt forslag pr. mail. Hård kill-switch `AGENT_LIVE_SEND_ENABLED` (default OFF) i Executor og handler; den vises i Pilot Health og i `safety:flags`. `harness:send-producer` 5/5 (ingen afsendelse mulig: kræver Graph ukonfigureret + flag off). |
| C | Browser/UI-verifikation (Agent Inbox/Pilot Health) | DONE | `npm run harness:ui-e2e` 5/5. Syntetiske staging-brugere (admin + montør) med password der kun lever i processen. `next dev` startes med staging-env, og eksterne integrationer tømmes. Headless Playwright klikker kun navigation, aldrig handlinger. **Fundet og rettet:** (1) `/dashboard/agents` kørte `getAgentInbox()` for ikke-admins (layout og side renderes parallelt) og loggede en serverfejl ved hvert besøg; (2) Pilot Health viste "Samlet: Ukendt" blot fordi crons ikke havde kørt endnu. Skærmbilleder gennemset. |

## Fakturapipeline-fejl (efter P3 #19)
| # | Opgave | Status | Note |
|---|---|---|---|
| F-a | API-import må ikke overskrive hoveddata med tomme værdier (IC5) | DONE | Eksisterende værdi vinder, og strukturerede hints bruges. `harness:invoice-pipeline` I5 |
| F-b | Linje→produkt-match | DONE | Varenummer bevares. Deterministisk varenr. → EAN → tekst-varenr. (samme leverandør). I6 |
| F-c | Reel dækningsgrad | DONE | `coverage.ts` + prod-script + Pilot Health. Prod: 0 % (ærligt). I7 |
| F-d | RLS på incoming_invoices* | DONE (prod 2026-09-29) | `incoming_invoices` var allerede låst af 00160, men **linjer + audit-log var åbne i prod (P-007, S3)**. Migration 00166 giver dem samme model, og audit-loggen bliver append-only. `harness:invoice-rls` 5/5 med rigtige rolle-sessioner. Runbook: docs/runbooks/00166-incoming-invoices-rls.md |
| F-e | Faktura-PDF læses aldrig (IC11) | DONE (kode, flag OFF) | `INVOICE_ATTACHMENT_FETCH_ENABLED` (default OFF, i `safety:flags` + Pilot Health). Når flaget er TIL: Graph-hent af vedhæftninger før parsing, sikker fallback til brødtekst. `harness:invoice-pipeline` 10/10 (I8–I10). `backfillEmailAttachments` var ugatet (skrev via service, så auditten så den ikke). Nu gatet med `inbox.view`. **RBAC-auditten fanger nu også indirekte skrivning** (kendte skrivende services + storage upload/remove/move). Nyt fund i samme ombæring: `uploadEmployeeAttachment` var ugatet → `customers.view`. `uploadPortalAttachment` er token-undtaget. |
| F-f | Backfill + PDF-parse + klassifikation (IC11–IC14) | DONE (kode) · afventer Vercel-flag | Opgradering af SAMME brødtekst-faktura (ingen dubletter), backfill i faktura-cron'en (8/kørsel, idempotent, audit pr. mail), pdf-parse v2-fejl rettet (IC12), kundens egne mails frasorteres (IC13), ingen portal-arkivering (IC14). `harness:invoice-attachments` 7/7, `harness:invoice-pipeline` 10/10. Runbook: docs/runbooks/invoice-attachment-backfill.md |
| IC10 | Leverandørmatch på CVR (00167) | DONE (prod 2026-09-30) | Kolonne + trigger-normalisering (samme regel som parser) + CHECK + indeks, bevidst ingen UNIQUE (0 data; tvetydig = intet gæt). CVR-felt i leverandørformularen. `harness:supplier-vat` 8/8. Runbook: docs/runbooks/00167-00168-suppliers-vat-lockdown.md |

## Blokerede opgaver uden for nummerering
| Opgave | Status | Mangler |
|---|---|---|
| Prod-migration 00166 (fakturalinjer/audit RLS, P-007) | DONE | Kørt i prod 2026-09-29 (godkendt). `prod-verify-00166.ts post` grøn: montør 0/0, admin alle |
| Prod-migrationer 00164 (supplier_settings, P-005) + 00165 (prishistorik) | DONE | Kørt i prod 2026-09-29 (godkendt). Post-checks grønne |
| RBAC app-lag (P-006): skrivende server-actions uden rettighedstjek | DONE | Runde 1: 27 actions med ekstern effekt/globale indstillinger. Runde 2: 84 (modul-paritet). **Runde 3:** 46 gatet (opgaver, projekter/tid, mail-ops, besigtigelse, fuldmagt, dokumenter, tagtegning, advarsler, mailskabeloner, filer). **46 bevist undtaget** (`scripts/action-gate-exemptions.ts`): 28 server-only (auditten fejler, hvis de importeres i klientkode), 8 token-validerede kunde-actions (dynamisk bevist: `harness:exemption-proofs` 11/11, alle afviser 4 slags ugyldige tokens og kryds-kunde, positiv kontrol) og 10 egne data (bevist: bundet til den indloggede bruger). **`npm run check:rbac` er blokerende i CI:** en ny ugatet skrivende action, en falsk undtagelse eller en stale undtagelse fejler. Audit-negativtests 11/11. Resultat: 365 skrivende actions, 318 gatet, 47 bevist undtaget, 0 fejl (efter F-e). Fund: `files`-tabellen findes ikke i prod, så `files.ts`/`file-upload.tsx` er død kode. |
| Prod-migration 00163 (agent capability-guard) | DONE | Kørt i prod 2026-09-29 (godkendt). `prod:verify-00163` grøn |
| P1-gate: prod-migration 00162 (anon-eksponering, P-004) | DONE | Kørt i prod 2026-09-28 (godkendt). db-audit HØJ 21→0; prod:verify-00162 grøn; P-004 lukket. |
| P0-gate: prod-migration 00161 (R1–R4) | DONE | Kørt i prod 2026-09-27 (godkendt). prod:role-policies 0·0·0; prod:verify-00161 struktur + adfærd (admin/montør) grøn. |
| Beslutning: kundemail-crons (offer-/invoice-reminders) aktive under pilot? | BLOCKED | Henrik. Ingen sendt seneste 30 d, men kan sende uden varsel; invoice-reminders har ingen kill-switch (CRON_DISCOVERY F6/F7) |
| Beslutning: ret anon-crons (supplier-sync, learning-feedback, unanswered-mails, email-linker) | BLOCKED | Henrik — rettelse aktiverer adfærd i prod; supplier-sync = integration-gate (CRON_DISCOVERY F1–F4) |
| Aktivér `INVOICE_ATTACHMENT_FETCH_ENABLED` i prod (GODKENDT 2026-09-29) | BLOCKED (adgang) | Henrik sætter env i Vercel + redeploy (ingen Vercel-adgang her). Derefter kører backfill automatisk. Efter-måling: runbook invoice-attachment-backfill |
| IC13-oprydning: kundens egne mails i fakturakøen | DONE (prod 2026-09-30) | Read-only preview → 18 deterministiske rækker afvist samlet via data-migration 00169 (regel genverificeret i transaktionen, abort ved afvigelse; testet abort-sti på staging). Intet slettet; audit pr. række. 2 med intern afsender (eltasolar.dk) bevidst udeladt → manuel vurdering. Kø: 51 → 33 åbne |
| Prod-migrationer 00167 (CVR) + 00168 (suppliers skrivelås, P-008 S2) | DONE | Kørt i prod 2026-09-30 (godkendt). Alle pre/post-checks + persona-checks grønne; P-008 lukket |
| P-009 runde 1 (00170): customers, customer_contacts, offers, offer_line_items, portal_access_tokens, customer_documents, incoming_emails | DONE (staging) · prod-gate | Matrix → genereret SQL; CI check:rls-matrix; harness:rls-lockdown 7/7 (172 checks, rigtige sessioner); regression grøn. Runbook: docs/runbooks/p009-rls-write-lockdown.md |
| P-009 runde 2A (00171): finance/arbejdsordrer, integrationer/webhooks, automation, skabeloner (15 tabeller) | DONE (staging) · prod-gate | 339 persona-checks grønne. Trigger-fund: profit-snapshot skrev som brugeren → trigger-funktioner SECURITY DEFINER + revoke. App: egne timer håndhæves nu. db-audit LAV 101→86 |
| P-009 runde 2B (00172): leverandørprisdata (10 tabeller) | DONE (staging) · prod-gate | Kode: API-drevne system-skrivninger → service-role i gatede actions; supplier_products kun admin. 210 persona-checks. Anon-grants bevaret på 4 cron-tabeller (P-003) — RLS blokerer stadig |
| Pilotbrugere oprettes og onboardes | BLOCKED | Henrik: navne + rolle for 2–3 pilotbrugere (P2 serviceleder, P3 montør/bogholderi) |

## Fund registreret undervejs
- P-004 (S1) anon kunne læse 310k leverandørpriser via view + forfalske audit (→ 00162).
- Offers-RLS: UPDATE/DELETE `USING (true)` for alle indloggede (montør kan slette tilbud via REST). Ikke eksponeret for anon. → vurderes i #11/RBAC-milestone (kræver DDL-gate).
- P-001 getDecryptedCredentials var ugatet server action (rettet i kode) · P-002 v_recent_audit_logs omgik RLS (R4, i 00161) · P-003 supplier-sync-cron bruger anon-klient (→ #9).

## Log
- 2026-09-30: P-009 runde 2B (00172) på staging: 10 leverandørpris-tabeller låst (supplier_products kun admin); 210 checks; db-audit LAV 76.
- 2026-09-30: P-009 runde 2A (00171) på staging: 15 tabeller, 339 checks; nyt transitivt trigger-audit (prod-trigger-writes) fangede 2 brud → rettet.
- 2026-09-30: P-009 runde 1 (00170) på staging: 7 tabeller låst til appens roller, 172 persona-checks grønne; prod afventer gate.
- 2026-09-30: RBAC-audit tæller nu også mail/SMS/e-conomic-effekter og hjælpere i action-filer → 24 ugatede actions gatet (AI-mailassistent, besigtigelses-/kundemails, test-mail uden login [S3: åben relay med fast indhold], indstillinger, sager, sync); 9 token-/public-undtagelser dynamisk bevist (exemption-proofs 20/20, action-auth 6/6). check:rbac: 442 skrivende, 386 gatet, 56 undtaget, 0 fejl.
- 2026-09-30: RBAC-audit udvidet med transitiv service-skrive-analyse (AST, scripts/rls-write-sites.ts) → 15 nye ugatede skrivende actions fundet og gatet, heriblandt P-010 (S2, uautentificeret sletning af kundedokumenter) og P-011 (S2, bankmatch uden rettighed). `harness:action-auth` 5/5. check:rbac: 399 skrivende, 352 gatet, 47 undtaget, 0 fejl.
- 2026-09-30: 00169 (IC13) kørt i prod: 18 kundemails afvist som ikke-faktura, 2 interne til manuel vurdering. IC13-reglen i koden udelader nu også interne afsendere.
- 2026-09-30: 00167 + 00168 kørt i prod (godkendt), alle checks grønne; P-008 lukket. Vercel-flag INVOICE_ATTACHMENT_FETCH_ENABLED: godkendt, men ikke sat (ingen Vercel-adgang) — backfill afventer.
- 2026-09-29: npm audit fix (ikke-breaking): 27 sårbarheder (3 kritiske: basic-ftp path traversal i LM-FTP, next, fast-xml-parser) → 1 high (nodemailer, kræver major-opgradering, åben). Harness-fund: harness:smoke blokeres fail-closed af env-guard (sammenligner staging med sig selv efter app-env-genbinding) — åben, lav.
- 2026-09-29: IC10/00167 (CVR) + 00168 (P-008) på staging, 8/8. Nyt read-only audit `prod-write-policies` → P-009: 109 tabeller åbne for skrivning (S2 systemisk).
- 2026-09-29: F-f: faktura-backfill-design (opgradering, idempotent, ingen portal-arkivering), IC12 pdf-parse v2-fejl, IC13 kundens egne mails. Prod-baseline taget (read-only).
- 2026-09-29: F-e (IC11) faktura-vedhæftninger: flag-gatet hentning (OFF), backfill-action gatet, RBAC-audit udvidet til indirekte skrivning (365 actions, 0 fejl).
- 2026-09-29: død kode fjernet: src/lib/actions/files.ts + src/components/shared/file-upload.tsx (tabellen files findes ikke i prod; komponenten blev ikke importeret).
- 2026-09-29: prod-migrationer 00163→00164→00165→00166 kørt (godkendt), alle pre/post-checks grønne; P-005 + P-007 lukket.
- 2026-09-29: fakturapipeline F-d: 00166 (linjer + audit RLS) på staging; P-007 registreret.
- 2026-09-29: fakturapipeline F-a/F-b/F-c (hoveddata bevares, linje→produkt, reel dækning).
- 2026-09-29: RBAC runde 3 færdig — 0 ugatede skrivende actions; streng audit blokerende i CI.
- 2026-09-28: RBAC runde 2 (modul-paritet): 84 actions i kalkulations-/stamdata-/pakkedomænet gatet; 176 → 92.
- 2026-09-28: RBAC app-lag runde 1 (P-006): 27 actions med ekstern effekt/globale indstillinger gatet.
- 2026-09-28: P3 #19 fakturakontrol (motor + design) + 3 e-conomic-vejfejl rettet. **P3 komplet.**
- 2026-09-28: P3 #18 Profit Engine (ren motor + design) + 2 prisfejl rettet.
- 2026-09-28: P3 #17 grossist-discovery + P-005 (S3) rettet i kode; 00164/00165 på staging.
- 2026-09-28: P3 #16 opfølgningsmotor designet + bygget (ren); fakturarykker-fund dokumenteret.
- 2026-09-28: P3 #15 Relatel discovery + CTI-foundation (ingen netværk, ingen SMS).
- 2026-09-28: P2-rest C: reproducerbar UI-E2E (staging, syntetiske brugere) + 2 UI-fejl rettet. P2-rest A–C færdig.
- 2026-09-28: P2-rest B: send_reply-producer + live-send kill-switch (intet sendt).
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
