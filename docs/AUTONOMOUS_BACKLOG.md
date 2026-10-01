# ELTA CRM — Autonom backlog

Arbejdsregel: en blocker stopper kun sin egen opgave (→ `BLOCKED` med præcist hvad der mangler); arbejdet fortsætter
med næste ikke-blokerede opgave. Cyklus pr. opgave: INSPECT → PLAN → IMPLEMENT → TEST → FIX → REGRESSION → COMMIT →
PUSH → DONE. Prod-migrationer kræver altid Henriks gate (forberedes, køres ikke). Floorplan/3D: PARKERET.

Status: `TODO` · `IN_PROGRESS` · `BLOCKED` · `BLOCKED_APPROVAL` (kun prod-gate; arbejdet fortsætter) · `DONE`

**Arbejdsmode (Henrik 2026-10-01):** en prod-gate stopper KUN sin egen opgave → `BLOCKED_APPROVAL`, alt forberedes færdigt, næste sikre opgave tages straks. Stop kun ved ny S1/S2, alt blokeret, eller 8–10 væsentlige opgaver.

**DELIVERY MODE (Henrik 2026-10-01):** mål = ELTA CRM 1.0 i daglig drift. Prioritet: GO-LIVE → driftsblokerende fejl → S1/S2 →
NEXT → audits/refactors. Komplette vertikale brugerflows; GO-LIVE tømmes først. Prod-gates samles i batches.
Grundlag: 3 flow-gennemgange (kode → action → RLS) + read-only prod-brug 2026-10-01 (105 kunder, 15 tilbud, 8 sager,
3 arbejdsordrer, 1 timeregistrering, 2 medarbejdere, 802 mails / 67 seneste 30 d) → systemet er reelt før go-live.

## GO-LIVE
| # | Flow | Problem (fundet) | Status |
|---|---|---|---|
| G0 | Medarbejdere/tid | Timeregistrering hardkodet +02:00 → alle timer 1 t forkert fra 25/10 (vintertid); redigering læste klokkeslæt i servertid (UTC) | DONE (kode) |
| G1 | Tilbud → kundeportal → accept | Kunden får "Der opstod en fejl" ved underskrift (webhook-payload kræver login, kastes uden try); intern mail + autopilot køres aldrig; sag/projekt oprettes aldrig fra portalen (kræver bruger-session) | DONE (kode) — webhooks flyttet til server-only service (kaster aldrig; lukker samtidig en ugatet eksporteret webhook-action), tilbud→sag-kerne med service-role og sælgeren som ansvarlig. ui-e2e U10 som kunde UDEN login (negativ kontrol: gammel kode fejler). Legacy-projektoprettelse fra portal uændret (fejler stille som før; projects-modulet er legacy) |
| G2 | Kundeportal | Første klik fra tilbudsmail sender kunden tilbage til oversigten (samme rodårsag, getPortalOffer) | DONE (kode) — U10 første klik |
| G3 | Kundeportal | Tilbudsmail fandt kun tokens med fremtidigt udløb (prod: alle 39 aktive tokens er UDEN udløb, 3 kunder har flere) → linket faldt tilbage til /view-offer-redirect; udløbne-men-aktive tokens blokerede nyt link | DONE (kode) — samme token-regel som portal-link/view-offer (NULL eller fremtid, nyeste), udløbne deaktiveres ved ny adgang (RLS: offers.send-roller har UPDATE). Prod-effekt i dag: links går direkte til portalen i stedet for via redirect |
| G4 | Planlægning/montør | Montør: tom kalender (employees-liste kræver employees.view), kunne ikke afslutte job (planned→in_progress krævede work_orders.edit), kunne ikke uploade fotos, landing viste ikke job, tom medarbejdervælger i timeformular; desuden kunne enhver montør afslutte ANDRES arbejdsordrer (ingen scope-tjek) | DONE (kode) — "Mine job" på landingssiden (ikke afsluttet / i dag / kommende → direkte til Planlægning-fanen), montør afslutter eget job direkte (planned→done; RLS 00171 tillader done), scope-tjek på statusskift, kun brugbare knapper pr. rolle, kalender viser egen række (+ forklaring hvis login ikke er koblet), foto/PDF-upload på sagens Dokumenter-fane (cases.edit.own + scope), timeformular forvalgt med montøren selv, kalender-"i dag" i dansk tid. ui-e2e U11 som montør. **Drift (Henrik):** prod har 2 montør-logins, kun 1 koblet til medarbejder → opret/knyt via Medarbejder → Rediger → Login |
| G5 | Planlægning | Serviceleder kan kun se egen employees-række (RLS 00096) → kan ikke planlægge montører | → G10 (Henrik: fortsæt på staging) |
| G6 | Kunder/sager (salg) | Rolle salg kunne oprette sag men ikke se den (cases.view.assigned manglede, selv om getCaseScope har et salg-mønster: egne sager via created_by/assigned_to); tilbudsmail fra salg uden PDF og med hardkodede firmaoplysninger (getCompanySettings kræver settings.view) | DONE (kode) — salg får cases.view.assigned (scope = egne sager), tilbudsmail/PDF læser kun offentlige firma-kolonner (aldrig SMTP/SMS-hemmeligheder). ui-e2e U13 som salg. pilot-roles + guard-audit grønne |
| G7 | Leverandørfaktura | Bogføring i e-conomic fejler altid: suppliers.external_supplier_id og costAccountNumber kan ikke sættes nogen steder | → NEXT (N12). Henrik: e-conomic ER del af 1.0, men må ikke blokere øvrig go-live |
| G8 | Leverandørfaktura | Ingen manuel upload af faktura (ingestFromUpload uden UI) | DONE (kode) — "Upload faktura" på listen (incoming_invoices.edit): PDF/JPG/PNG ≤15 MB gemmes privat (attachments/supplier-invoices, signeres ved visning), PDF-tekst → samme parse/match som mail, dedup med samme nøgle som mail (tekst-hash) → dublet åbner eksisterende og rydder filen op. ui-e2e U12; invoice-pipeline 10/10, invoice-attachments 8/8 |
| G9 | Mail/indbakke | Montør så og kunne arkivere/koble al firmamail (inbox.view uden scope) — privatliv | DONE (kode, Henrik 2026-10-01) — inbox.view fjernet for montør (menu + /dashboard/mail → ingen adgang); sagens mails/dokumenter scope-tjekkes (kun egne sager). ui-e2e U4 (3/3) + U11 (egen sagsmail synlig, fremmed skjult). **DB-del → G10** |
| G10 | Mail/medarbejdere (RLS) | incoming_emails SELECT USING(true) → montør kunne læse al mail via REST; serviceleder så kun egen employees-række (G5) | BLOCKED_APPROVAL — 00180 på staging grøn (rls-read L9/L10 + fuld regression), prod pre-check ✅, runbook docs/runbooks/00180-g10-mail-scope-employees.md. Rettelse: employees.cost_rate/hourly_rate er kost-/salgssatser (løn ligger i employee_compensation) → ingen kolonne-lockdown nødvendig |
| G11 | Opsætning før pilot | Montør #2 har login men ingen koblet medarbejder → ser ingen job, kan ikke registrere tid | TODO (Henrik, drift): Medarbejder → Rediger → Login → "Knyt eksisterende bruger". Verificér: `npx tsx scripts/prod-montor-linkage.ts` (koblet = montoer_logins) |

## NEXT
| # | Område | Opgave |
|---|---|---|
| N1 | Tilbudsopfølgning | Opfølgning synlig for sælger | DONE — kort "Opfølgning" på Tilbud: sendte tilbud prioriteret efter næste skridt (udløber snart → set/ubesvaret → ikke åbnet → afventer), Ring/Åbn, salg ser egne, admin/serviceleder alle; ærlig om at auto-påmindelser er slået fra. Ren regel (followup/offer-followup.ts, dansk kalender) 14 tests i CI; ui-e2e U14. Fundet+rettet undervejs: hydreringsfejl i kunde-/lead-/tilbudslister (relativ tid beregnet på server og klient) → SmartDate |
| N2 | Tid | Godkendelse af timer (time_logs.approve findes kun som permission) |
| N3 | Grossist | AO manuel sync-knap (stub), SupplierStatusCard ikke monteret, syncSupplierPrices per-SKU/timeout |
| N4 | Grossist | Produktsøgning ilike på 324k rækker uden trigram-indeks (migration) |
| N5 | Faktura | Faktura direkte fra tilbud i UI; kladde-redigering; "Markér som sendt" → e-conomic; kreditnotaer → e-conomic; betalinger → e-conomic (cashbook-konfiguration) |
| N6 | Faktura | /dashboard/bank i sidebar | DONE — menupunkt "Bankafstemning" (bank.view) + ModuleGuard (før: fejlside uden rettighed) |
| N7 | Profit | Arbejdsordre-profit-snapshot skrives/vises aldrig (profitability.ts ukaldt) |
| N8 | Tilbud | acceptOffer håndhæver ikke status/udløb server-side; send uden DB-tjek; portal viser tom sælger | DELVIST — accept håndhæver nu sendt/set + ikke udløbet server-side; fælles gyldighedsregel (hele "gyldig til"-dagen i dansk tid; før udløb kl. 02:00 på sidste dag) i server + portal, test:time (CI). Rest: send-DB-tjek, sælger i portal |
| N9 | Sager | To parallelle sags-UI'er (Sager/Ordrer + Service) på samme tabel |
| N12 | e-conomic | Opsætning før kobling: e-conomic-leverandørnr. pr. leverandør, omkostningskonto, kassekladde/modkonto (betalinger), kreditnotaer → e-conomic |
| N11 | Planlægning | Montør kan starte eget job | BLOCKED_APPROVAL — kode deployet bag MONTOR_START_JOB_ENABLED (OFF), RLS 00181 (WAVE5) på staging grøn: montør starter/afslutter KUN egne arbejdsordrer (lukker samtidig at montør kunne opdatere enhver arbejdsordre via REST). Prod pre ✅. Runbook: p009-rls-write-lockdown.md § Runde 5 |
| N10 | Planlægning | "Planlæg opgave"-knap vises for montør; interne beskeder: vedhæft fil "kommer snart" |

## LATER
Floorplan/3D · fuld Kalkia-motor · F2b katalog-prisspænd (migration) · generelle audits/refactors · Relatel trin 1–5 (ekstern aktivering gated)

## Ventende godkendelser (BLOCKED_APPROVAL)
| Gate | Forberedt | Runbook |
|---|---|---|
| Prod 00175–00177 + 00179 (læse-side: tokens, hemmeligheder, beskeder, underskrifter) | kode deployet; staging + rls-read 8/8 | docs/runbooks/p009-rls-write-lockdown.md |
| Prod 00178 (runde 4: 44 kalkulations-/katalogtabeller) | staging 44/44, pre-check grøn | samme |
| Prod 00180 (G10: montør kun mails på egne sager + serviceleder ser medarbejdere) | staging grøn, prod pre ✅ | docs/runbooks/00180-g10-mail-scope-employees.md |
| Prod 00181 (WAVE5: montør starter/afslutter kun egne arbejdsordrer) + derefter Vercel MONTOR_START_JOB_ENABLED=true | staging grøn, prod pre ✅ | docs/runbooks/p009-rls-write-lockdown.md § Runde 5 |
| Vercel: INVOICE_ATTACHMENT_FETCH_ENABLED=true (faktura-backfill) | kode deployet, baseline taget | docs/runbooks/invoice-attachment-backfill.md |
| Aktivering af hidtil døde crons (cookie-klient → service-role): unanswered-mails (interne opgaver), offer-reminders (KUNDEMAIL), supplier-sync | analyse færdig; ændrer cron-adfærd → kræver separat godkendelse | — |
| Opfølgning: prod-cron-status efter 00170–00174 | DELVIST VERIFICERET 08:23 UTC: bank-match, export-error-notification, invoice-reminders, offer-reminders, payment-report = ok. Udestår: unanswered-mails (12:00 UTC), natlige crons — `scripts/prod-cron-status-since.ts "2026-10-01 05:10"` | — |

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
| P-009 runde 1 (00170): customers, customer_contacts, offers, offer_line_items, portal_access_tokens, customer_documents, incoming_emails | DONE (prod 2026-10-01) | Matrix → genereret SQL; CI check:rls-matrix; harness:rls-lockdown 7/7 (172 checks, rigtige sessioner); regression grøn. Runbook: docs/runbooks/p009-rls-write-lockdown.md |
| P-009 runde 2A (00171): finance/arbejdsordrer, integrationer/webhooks, automation, skabeloner (15 tabeller) | DONE (prod 2026-10-01) | 339 persona-checks grønne. Trigger-fund: profit-snapshot skrev som brugeren → trigger-funktioner SECURITY DEFINER + revoke. App: egne timer håndhæves nu. db-audit LAV 101→86 |
| P-009 runde 2B (00172): leverandørprisdata (10 tabeller) | DONE (prod 2026-10-01) | Kode: API-drevne system-skrivninger → service-role i gatede actions; supplier_products kun admin. 210 persona-checks. Anon-grants bevaret på 4 cron-tabeller (P-003) — RLS blokerer stadig |
| P-009 runde 3A (00173): sager/projekter/leads/tilbudstilbehør/underskrifter/beskeder/partner-tokens (21 tabeller) | DONE (prod 2026-10-01) | 489 persona-checks. Trigger-fund: timer → projects.actual_hours som brugeren → SECURITY DEFINER. Underskrifter kan ikke længere forfalskes via REST |
| P-009 runde 3B (00174): mail/SMS-log, mail-synk-tilstand, AI-forbrug/-prompts, mail-intelligens (11 tabeller) | DONE (prod 2026-10-01) | 231 checks. Trigger-fund: tråd-statistik som brugeren → SECURITY DEFINER. AI-budgetloft og promptskabeloner kan ikke længere ændres via REST |
| P-009 runde 4 (00178): kalkulation/katalog/master data (44 tabeller) | DONE (staging) · prod-gate | Auto-specs fra metadata; FØR 44/44 huller, EFTER 44/44 som matrixen. Fund: betingede policies blev ikke droppet → rettet + strengere pre-check |
| P-009 anon-kontekst-korrektion | DONE | Anon-crons (P-003) læser tabeller som ellers ville skifte fra tom til fejl → keepAnonGrants + CI-check; 00170 rettet (customer_contacts, incoming_emails) |
| P-009 læse-side A1–A3 (00175–00177): portal-/partner-tokens, integrationshemmeligheder, bekræftelses-tokens, underskrifter, beskeder | DONE (staging) · prod-gate | harness:rls-read 7/7, bevist FØR/EFTER. Følsom-kolonne-scan (prod-sensitive-columns) → resten: company_settings-hemmeligheder (0 værdier) + e-conomic-tokens = A4 |
| P-009 læse-side A4 (00179): company_settings-hemmeligheder + e-conomic-tokens | DONE (staging) · prod-gate | Fund: getCompanySettings sendte SMTP-password/SMS-nøgler til browseren for settings.view. Nu eksplicitte offentlige kolonner; hemmeligheder kun via service-role i gatede stier. rls-read L8, bevist FØR/EFTER |
| Pilotbrugere oprettes og onboardes | BLOCKED | Henrik: navne + rolle for 2–3 pilotbrugere (P2 serviceleder, P3 montør/bogholderi) |

## Feature delivery (efter P-009)
| # | Opgave | Status | Note |
|---|---|---|---|
| F1 | Lønsomhedsanalyse på tilbud (Profit Engine i brug) | DONE | Fund (prod): 7/14 tilbudslinjer uden kostpris → eksisterende DB-visning regner timer som 0 kr (staging-eksempel: 90 % vist, realistisk 31,7 %). Ny ren analyse (offer-analysis.ts: kendt/estimeret/ukendt kost, realistisk DB, kostdækning, advarsler, dom) + action (offers.view.cost_prices; timekost efter firmaets kostbasis, aggregeret) + kort på tilbudssiden. test:profit (CI) 11/11, ui-e2e U7 |
| F2 | Grossist-prissammenligning på tilbud (KlarPris-foundation) | DONE | Prod: 564 EAN hos både AO og LM, 460 med >5 % forskel (gns. spænd 16,7 %). Ren sammenligning (EAN-13/GTIN-14-normalisering, tærskel, deterministisk) + action (offers.view.cost_prices) + kort "Billigere hos anden grossist" med besparelse pr. linje. test:profit (CI) + ui-e2e U8 |
| F2b | Indkøbsoversigt: største prisforskelle på tværs af kataloget | BLOCKED_APPROVAL | Kræver DB-view/RPC over 323k varer (migration). Forberedes til næste migrationsbatch |
| F3 | Fakturakontrol på leverandørfaktura | DONE | Kontrolmotor (controlInvoice) + samme matching som dækningsmålingen (gemt link → varenr. → EAN → varenr. i tekst) vist som panel på /dashboard/incoming-invoices/[id]: dom, dækning, overpris, match og forventet pris pr. linje. Kun læsning, gate incoming_invoices.view (linjer RLS 00166). ui-e2e U9 |

## Fund registreret undervejs
- P-004 (S1) anon kunne læse 310k leverandørpriser via view + forfalske audit (→ 00162).
- Offers-RLS: UPDATE/DELETE `USING (true)` for alle indloggede (montør kan slette tilbud via REST). Ikke eksponeret for anon. → vurderes i #11/RBAC-milestone (kræver DDL-gate).
- P-001 getDecryptedCredentials var ugatet server action (rettet i kode) · P-002 v_recent_audit_logs omgik RLS (R4, i 00161) · P-003 supplier-sync-cron bruger anon-klient (→ #9).

## Log
- 2026-10-01: P-009 læse-side A4 (00179) på staging; pilot-roles-probe gjort uafhængig af skjulte kolonner.
- 2026-10-01: P-009 læse-side A1–A3 (00175–00177) + runde 4 (00178) på staging; prod afventer gate.
- 2026-10-01: P-009 runde 1–3B (00170–00174) kørt i prod (godkendt); alle pre/post/trigger/effektiv-adgang-checks grønne; åbne skrive-tabeller 108→44.
- 2026-09-30: P-009 runde 3B (00174) på staging: 11 tabeller; alle 5 runder (64 tabeller) grønne samlet; db-audit LAV 44.
- 2026-09-30: P-009 runde 3A (00173) på staging: 21 tabeller, 489 checks; trigger-fund (projekttimer) rettet; db-audit LAV 55. Anon-kontekst-regel (P-003) indført.
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
