# Development status — checkpoint til næste session

**Opdateret:** 2026-09-27 · **Repo:** `C:\Dev\elta-crm` (`main` = prod-deploy via Vercel) · **Backlog:** [AUTONOMOUS_BACKLOG.md](AUTONOMOUS_BACKLOG.md)

## Overnight run 2026-10-01 → (løbende checkpoint)
**Start:** 2026-10-01 20:18 dansk (18:18 UTC) · start-commit `4606dde`

| Tid (dansk) | Checkpoint |
|---|---|
| 20:18 | Start. Full regression U1–U39 kører. Forberedt: e-conomic-tjekliste "Fakturerede kunder koblet". |
| ~21:00 | `88ab138`: montør-visning uden priser (D18), Kopiér tilbud (N15), omplanlægning verificeret (N16), portal-faktura-PDF (D19), bank-advarsel (G12 — RETTET senere: fakturaer læser bank fra Vercel-env, ikke firmaindstillinger; prod-status ukendt), e-conomic-tjekliste kunder. U40–U43 grønne. `2c9daa3`: gotoSafe (regression U1–U39 væltede på navigations-timeout, ikke app-fejl). Full regression U1–U43 kører. |
| 21:35 | Regression U1–U43: 42/43 (U18 timing-flake → robust vent, grøn alene). `01387ef`: Mine timer (N17), Kun mine på leads (N18), forfald dansk kalender (D20); U44–U45 grønne. Full regression U1–U45 startet. |
| 22:09 | Regression U1–U45: 44/44 funktionelle grønne, U5 navigationsafbrud (test rettet). `ca15a79`: PDF-fixes (salg/bogholderi 500, fakturamail uden PDF, eksplicit adgang), fælles bankkilde (D21/D22, G12 korrigeret); U46–U47 + negativ kontrol. Full regression U1–U47 startet. |
| 22:39 | Regression U1–U47: 46/46 funktionelle grønne; U5-fund efter parallelle API-kald i samme kontekst (O1, observation). `23cb9d8`: lukke-værn mod ufaktureret arbejde (D23) + U48. Full regression U1–U48 startet. |
| 23:39 | U1–U48: 47/47 funktionelle grønne (U5: "network error" i lange kørsler — O1). `ccced39`: portal-tilbudslinjer uden kost/noter (D24, S2 — prod: 2 tilbud/2 kunder havde kostpris i sidedata), dashboard-forfald (D25); U49–U50 m. negative kontroller. `d7ae5ee`: 00184 forberedt (D26 sagsfotos synlige for kunde — beslutning). `a582e92`: klokke-støj (D27, system_alerts findes ikke), test-robusthed (U11/U48). Full regression U1–U50 startet. |
| 00:38 | **Første helt grønne fulde regression: U1–U51 51/51** (dev-server-genstart ved hukommelse håndteret + rapporteret — O1 årsag fundet). `10fd790` U51 grossistlinje. `96f26ec`: kundekortets mails fejlede altid i prod (D28, tvetydig join) + gate; U52 m. negativ kontrol. Full regression U1–U52 startet. |
| 01:42 | U1–U52 52/52 ✅; U1–U54 53/54 (U21 = dev-genstart, gjort robust). `cfbec0d` go-live "Opsætning før pilot" (G13, U53). `8d9da00` PGRST201-sweep (ingen flere). `e9c6ead` Opret tilbud fra lead (N20) + standard-gyldighed for salg (D30, U54). `27cd230` firmaoplysninger på sælgers tilbuds-print (D31, U55). Full regression U1–U55 startet. |
| 02:53 | U1–U55: 45/55 — alle 10 fejl efter dev-genstart, grønne i målrettet genkørsel; prod verificeret fri for test-data. `da73f44`: interne sagsbemærkninger skjult for kunden (D32, S2 forebyggende) + U56; testserver mere heap. Full regression U1–U56 startet. |
| 03:28 | U1–U56: 55/56 (U13 under dev-genstart — nu sent i kørslen takket være mere heap; grøn i genkørsel). `` D33: tilbuds-PDF til kunden uden interne noter (S2, forebyggende — 0 berørt i prod). |
| 04:01 | **U1–U56 56/56 ✅ uden dev-genstart** (mere heap virkede). `cf919b6` faktura-PDF uden intern note (D34). `d18db85` partnerportal uden interne bemærkninger. `d10ebd4`+`5ba4af6` datoer i dansk tid i PDF/sider/mails (D35, 31+17 steder). Full regression U1–U56 startet. |
| 04:26 | U1–U56: 55/56 (U11 kalender under dev-genstart). **CI var rød** siden D18 (check:rls-matrix) → rettet `d671d59` (D36); alle CI-trin + `next build` grønne lokalt. Prod read-only "Opsætning før pilot": firma ✓ CVR ✓, bank i firmaindstillinger ✗ (env ukendt), 1/2 montør-login ukoblet (G11), 2 fakturerede kunder uden e-conomic-kobling. |
| 04:36 | `45d9638`: accepteret tilbud → leads vundet (N21, U57 m. negativ kontrol). Full regression U1–U57 startet. |
| ~05:30 | U1–U57 57/57 ✅. `cdb994d` Udløbet-mærke (N22, U58). U1–U58 58/58 ✅. `94df5be` øvrige omkostninger uden kost for montør. `12fb1a8` morgenbrief (docs/OVERNIGHT-2026-10-02.md). |
| 06:29 | Slut-regression U1–U58: 54/58 — 4 fejl under netværksudfald mod staging-Supabase kl. 06:01 (UND_ERR_SOCKET "other side closed"); alle 4 grønne i målrettet genkørsel. `eba82a2` D29. Prod read-only: ingen test-data. Alle CI-trin grønne lokalt. |
| **06:41** | **SLUT.** Start 2026-10-01 20:18 → slut 2026-10-02 06:41 (dansk tid). 43 commits (`4606dde..`), heraf 25 kode/test. Se docs/OVERNIGHT-2026-10-02.md |

## Dagsession 2026-10-02 (Henriks beslutninger D24/D26/D18/D28/D27/N2/N8a)
| Tid (dansk) | Checkpoint |
|---|---|
| 14:05 | Main: `1468251` D18 (montør-omkostninger uden prisfelter, U40), N8a (lav DB = advarsel m. bekræftelse, U60 + unit), D28 app-del (bogholderi læser kundens koblede mails, U61), samlet prod-gate pre/post (`prod:batch-check pre` ✅ 6/6 i prod; `prod:verify-read-lockdown`: prod pre ✅, staging post ✅, prod post fanger 16 afvigelser = negativ kontrol). `cf824d7`/`60d3b04` docs. Branches (kode kræver kolonner — merge først efter prod-migration): `d26-internal-case-docs` (00184, U59 7/7 + negativ kontrol), `n2-time-approval` (00185, rls-read L13, U62 8/8). Staging: 00184, 00185, 00186 anvendt; rls-read 13/13 (L12 D28, L13 N2). Fuld regression på main (U1–U58, U60, U61; U59/U62 ligger på branches) startet. |
| 16:12 | Henrik: ingen passiv ventetid (regel gemt). NEXT-2 genereret fra prod read-only + kodeanalyse (N23–N34, L-SMS, L-Lager). Branches (worktrees `C:\Dev\elta-n23`, `C:\Dev\elta-wf`): `n23-case-status` = N23 sagsstatus følger arbejdet (auto I gang + Klar til lukning, U63), N26a timer/kostbudget fra tilbud, N32 menupunkt Medarbejderøkonomi; `webform-inquiries` = **D37 (S2): hjemmesidens kontaktformular blev hard-ignoreret siden 30/4 (~48 henvendelser, kun 3 website-leads)** → fanen Webhenvendelser (U64) + N24a retro-kobling af 81 kundemails (U65). Fuld regression på main kører langsomt (offers/[id] goto-timeouts under hukommelsespres; dev-server genstartet 16:01) — ikke hængt. |
| 17:03 | Test-politik (Henrik): smoke ≤10, målrettet ≤20, proces ≤30, enkelt test ≤5 min. D38: e2e kører nu mod produktionsbuild (build ~40 s–2,5 min, tests 4–50 s) + watchdog-batches `harness:ui-batches` (FAILED_TIMEOUT/kill tree/sidste output, afhængigheder automatisk) + telemetri JSONL; 533 testbrugere ryddet på staging. Målt: montør 282 s, portal-mail 308 s, 16 berørte tests i 6 batches 735 s — ingen hængende processer. Lokalt main: merge af `webform-inquiries` + `n23-case-status`, D39 (legacy-projekt fjernet fra portal-accept), N27 (cockpit: sager klar til lukning, U67), N35 (Opret lead fra mail/webhenvendelse, U68), U22 rettet til prod-prerender. Pushes efter grøn batch-kørsel + lint. |

## Grok på grok-next (2026-10-09)
Efterkalkulation v1 er på `grok-next` (`2274215`): tilbudt/faktisk/afvigelse i øre, rabat én gang, manglende kost forbliver null, tilbudshoved via admin efter sagstjek. Sagsrentabiliteten på `/dashboard/reports` bruger samme kostregel (`src/lib/cases/profitability-figures.ts`). Fakturakontrol-dækningen i Pilot Health og fakturapanelet bruger kostprisen på fakturadatoen. Panelet henter `price_history` side for side, så den tidligste tilbagerulning ikke falder af ved over 1.000 senere ændringer (`price-at-date-test`). Opfølgningens skygge i Pilot Health viser kun antal mod dagens regler og sender intet (`followup-shadow-test`). Leverandørfakturaens panel viser om linjesummen stemmer med beløb ekskl. moms (`header-totals-test`); en linje uden beløb gør forskellen ukendt. OIOUBL-fakturaer og kreditnotaer læses til hovedfelter og linjer i `parseAndMatch` (`oioubl-test`); linjer gemmes kun når fakturaen ingen har. Dashboardet og opgavesiden viser mine forfaldne opgaver og dagens liste efter dansk kalenderdag (`my-day-test`). Tilbuddets linjefod viser DB efter tilbudsrabat ved siden af tallet før rabat (`offer-db-shadow-test`). Ingen prod-migration. Claude ejer fortsat storage/auth/RLS og prod-gates.

## Slutrapport
AGENT: GROK
BRANCH: grok-next

Samlet arbejdstid: denne kørsel efter context compaction, plus rentabilitetsslicen umiddelbart før (`9defa9b`). Ikke et sammenhængende 8-timers-ur. To tomme konklusioner er forkastet: først fordi N29 ikke var bygget, derefter fordi fakturapanelet hentede `price_history` i ét kald (højst 1.000 rækker) og dermed kunne bruge en senere gammel pris. N29, Profit Engine trin 2 og pagineringen er leveret. Genlæsning af backloggen og design-dokumenterne efter rettelsen: der er ingen yderligere NOW/NEXT-række, som kan bygges på grok-next uden prod-godkendelse, live afsendelse, migration eller Claudes spor.

Features leveret:
- Sagsrentabilitet på `/dashboard/reports` behandler manglende kost som ukendt, ikke 0 (`9defa9b`).
- Fakturakontrol-dækning og det read-only prod-script bruger kostprisen på fakturadatoen (`cf620e3`). Scriptet er ikke kørt.
- Pilot Health viser opfølgningens skygge som antal. Der sendes ingen mail (`c3a9f25`).
- Leverandørfakturaens panel viser om linjesummen stemmer med beløb ekskl. moms. En linje uden beløb gør forskellen ukendt (`header-totals-test`). Godkendelse og e-conomic er urørt.
- OIOUBL-faktura og kreditnota giver hovedfelter og linjer (`oioubl-test`). `parseAndMatch` gemmer linjerne kun når der ingen er. Låste fakturaer genåbnes ikke.
- Mine forfaldne opgaver og dagens liste på dashboardet og opgavesiden (`my-day-test`). Kun egne kundeopgaver. Dagen er den danske kalenderdag.
- Tilbuddets linjefod viser DB efter tilbudsrabat ved siden af tallet før rabat (`1e8c198`, `offer-db-shadow-test`). Kost og salgspriser er uændrede. Send-gaten er uændret.
- Fakturapanelet henter hele `price_history` side for side og giver den til `expectedCostOnInvoiceDate`. En faktura med 1.001 senere ændringer får den første gamle pris, ikke dagens pris (`price-at-date-test`). Godkendelse og e-conomic er urørt.

Commits på grok-next i denne kørsel: `9defa9b`, `cf620e3`, `c3a9f25`, `aa76883`, `5591172`, `a60eebf`, `e70787f`, `7da4464`, `992cbd2`, `1e8c198`, `faa3928`, `c8d1f00` (paginering af `price_history` i fakturapanelet). Ingen merge til main. Ingen ny fil under `supabase/migrations`. Gren `grok-next`, upstream `origin/grok-next`.

Køen efter fakturakontrol (punkt 11–16):
- Opfølgning: trin 1 er leveret. Trin 2 er BLOCKED_APPROVAL (samme godkendelse som X4d). Trin 3 er live afsendelse. Trin 4 kræver migration.
- Leads og salg: rækkerne er DONE, ANALYSE (N56, N70, N72) eller BLOCKED_APPROVAL.
- Ydelse: N8-2, N8-3, N8-4 og resten af N36 er LATER. N4 er BLOCKED_APPROVAL (prod-indeks 00183).
- UI og mobil: Q1 er DONE.
- Statisk skema uden for Claudes spor: X3 er DONE. De åbne skema-fund er migrationer eller Claudes spor.
- Pilot: G13 er DONE. G11 og G12 er drift hos Henrik.
- Fakturakontrol trin 4 og 6 samt IC8-fejlsvaret forbliver BLOCKED_APPROVAL, fordi de sidder i `approveInvoice` og e-conomic-push. Trin 5 (`profit_snapshots`) er et eksisterende DDL-forslag og er ikke bygget.
- N29 er leveret: mine forfaldne og dagens liste. Fakturakontrol trin 2 og 3 var allerede i koden og er markeret DONE.
- Profit Engine trin 2 er leveret: reel DB efter tilbudsrabat i linjefoden. Trin 3–5 er BLOCKED_APPROVAL (migration og ændrede salgspriser). IC7 er parkeret: Henrik skal godkende salgsprisen på konverterede linjer, eller at de ikke faktureres før prisen er sat. IC10 var allerede i prod (00167).

Tests efter `c8d1f00`, alle exit 0: `aftercalc-test` (tilbudt omsætning 18.000, DB 6.000, ens tekst er ikke matchet, manglende kost er ikke en besparelse), `offer-vs-actual-test`, `price-at-date-test` (1.001 senere ændringer → første gamle pris 100, ikke dagens 120; loader henter mere end én side). Samme kørsel tidligere, urørt af pagineringen: `profitability-figures-test`, `followup-shadow-test`, `header-totals-test`, `oioubl-test`, `my-day-test`, `offer-db-shadow-test`. `npm run type-check`, `check:rbac` (479 skrivende, 419 gatet, 60 undtaget, 0 fejl) og `check:rls-matrix` med exit 0. UI er ikke åbnet: der er ingen `.env` / `.env.local`, og intet lytter på port 3000. Chrome findes. Next blev ikke startet.

Performance: ingen ny måling. Fakturapanelet henter `price_history` side for side (`fetchAllRows`, 1.000 rækker), samme loft som dækningen. Uden det tabes den tidligste tilbagerulning.

Blockers (mangler godkendelse, ikke påbegyndt):
- D27: prod-migration for `price_alert_rules` (00046 er ikke i prod).
- X4c: Henrik vælger afrunding før kundeaftale-RPC rettes.
- X4d / opfølgning trin 2: kundemail-cron. Et skift af agenten nu fjerner interne forslag, mens cronen ikke sender.
- Fakturakontrol trin 4: afvigelses-bekræftelse sidder i `approveInvoice`, som pusher til e-conomic.
- IC8 e-conomic-svar: en bogføringsfejl må ikke blive `ok: true`. Det sidder i samme push.
- N3: automatisk AO-sync mangler AO API/FTP-adgang.
- N12: live e-conomic-bogføring mangler nøgler og godkendelse.
- T13: Relatel-token og live SMS.
- N24 (b): 59 gamle pending-mails er prod-data.
- Q11 B1–B3, R-OFR-B, R-PRT-B, R-MAIL-B og de øvrige eksisterende BLOCKED_APPROVAL-rækker er uændrede.
- IC7: salgspris eller fakturerbarhed på linjer, der konverteres fra en leverandørfaktura.
- Profit Engine trin 3–4: migration til aftaler/snapshots, og udskiftning af prisalgoritmerne.

Findings til Claude:
- `getServiceCaseEconomy` læser stadig `employees.hourly_rate`. Efterkalkulationen bruger den ikke.
- Tilbuds-RLS skjuler stadig hovedet for serviceleder og bogholderi. Efterkalkulationen læser hovedet med admin-klienten efter sagstjek.
- `approveInvoice` pusher stadig til e-conomic. Den sti er ikke rørt.
- Claude ejer fortsat storage, auth, RLS og prod-gates. Intet af det er lukket her.

Næste anbefaling: Henriks godkendelsesbunke, med X4d (kundemail) og Q11 B1–B3 først, fordi de låser opfølgning trin 2 og rykkerbeløb. Dernæst D27 hvis prisadvarsler skal tændes. Claude fortsætter storage/auth/RLS.

## Nu
P0–P3 DONE · **RBAC app-lag DONE** (P-006 lukket: 317 gatet, 46 bevist undtaget, `check:rbac` blokerende i CI) · **fakturapipeline F-a–F-d DONE** (F-d prod-gate).
**Prod-migrationer 00159–00166 kørt og verificeret** (00163–00166 den 2026-09-29). Ingen prod-migration afventer.
**Venter på Henrik (beslutninger):** kundemail-crons (fakturarykkere har aldrig virket) · anon-crons · Relatel-token · pilotbrugere · agent-aktivering.
Næste ikke-blokerede (historisk, 2026-09-27): CVR-kolonne til leverandør-match (IC10) · døde `files.ts` · OIOUBL-parsing · prishistorik-baseret forventet pris.
Opdatering 2026-10-09: de fire historiske punkter er lukket. `files.ts` er fjernet. OIOUBL og prisen på fakturadatoen er leveret på `grok-next`, og panelet paginerer `price_history` (`c8d1f00`). IC10 er DONE i prod (00167), ikke en åben migration. Se slutrapporten ovenfor.

## Staging-state at kende
- 00175–00186 anvendt (00184 D26, 00185 N2, 00186 D28 den 2026-10-02 — prod afventer godkendelse) · 00159–00166 anvendt · view-parity (security_invoker på betalings-views) anvendt · agent_configs seedet.
- `npm run harness:pilot-roles` = fuld rolle-regression (matrix + skrive/update-probes + R1–R4 35 checks + views + hemmelige kolonner).
- P-003 udvidet (#9): 4 crons bruger anon-klient → stille no-ops; se docs/pilot/CRON_DISCOVERY.md. Ret ikke uden beslutning (= aktivering).
- Alle cron-kørsler logges i `system_health_log` (service `cron`) via `withCronRun`.

## Faste rammer (må ikke brydes)
- Alle 7 agents disabled/suggest i prod · `AUTO_CREATE_CASES_ENABLED` OFF · ingen live kundemail, cron-/event-autonomi,
  finance, delete, Relatel/SMS · Floorplan/3D parkeret.
- Prod-DDL kun med Henriks godkendelse → `npm run prod:apply-migration -- <nr> --approved-by-henrik` (allowlist i
  `scripts/prod-apply-migration.ts`). Alt andet mod prod er read-only (`scripts/prod-readonly.ts`).
- Git: én kommando pr. kald (`git add` / `git commit -m … -m …` / `git push origin main`) — kædede kommandoer afvises.
- Kode der kræver en ny kolonne merges først efter prod-migrationen (expand/contract; push til `main` deployer).

## Vigtige kommandoer
| Formål | Kommando |
|---|---|
| UI (staging, headless) | `npm run harness:ui-e2e` — syntetiske brugere, ingen rigtige logins; skærmbilleder i %TEMP%\elta-ui-e2e |
| Staging regression | `npm run harness:agent-gating` · `harness:send-producer` · `harness:agent-actions` · `harness:planning-flow` · `harness:security` · `harness:pilot` · `harness:pilot-roles` · `harness:status` · `harness:session-lifecycle` · `harness:concurrency` · `harness:ui-states` · `harness:cron-log` · `harness:health-snapshot` |
| Statisk ops | `ui:guard-audit` · `ops:cron-check` · `ops:incident-check` · `security:actions` · **`check:rbac`** (CI) |
| Staging migration | `npm run harness:migrate-staging -- <nr>` |
| Prod read-only | `prod:db-audit` · `prod:verify-00162` · `prod:verify-00161` · `prod:role-policies` · `prod:pilot-health` · `prod:storage-audit` · `prod:verify-00159/00160` · `npx tsx scripts/prod-cron-discovery.ts` |
| Kode | `npm run type-check` · `harness:typecheck` · `build` · unit: `npx tsx scripts/agent-*-test.ts` |
| Flag | `npm run safety:flags` |

## Seneste milepæle
- 2026-09-27: 00160 (RLS) + 00159 (offers.source_case_id) kørt i prod, verificeret; Pilot Ops PROD READY.
- 2026-09-27: P0 #1–#4 (R1–R4) lukket på staging + regressionsværn; 00161 forberedt (gate); R3-kode i prod.
