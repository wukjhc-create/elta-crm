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

## Nu
P0–P3 DONE · **RBAC app-lag DONE** (P-006 lukket: 317 gatet, 46 bevist undtaget, `check:rbac` blokerende i CI) · **fakturapipeline F-a–F-d DONE** (F-d prod-gate).
**Prod-migrationer 00159–00166 kørt og verificeret** (00163–00166 den 2026-09-29). Ingen prod-migration afventer.
**Venter på Henrik (beslutninger):** kundemail-crons (fakturarykkere har aldrig virket) · anon-crons · Relatel-token · pilotbrugere · agent-aktivering.
Næste ikke-blokerede: CVR-kolonne til leverandør-match (IC10, kræver migration) · døde `files.ts` · OIOUBL-parsing · prishistorik-baseret forventet pris.

## Staging-state at kende
- 00159–00166 anvendt · view-parity (security_invoker på betalings-views) anvendt · agent_configs seedet.
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
