# Development status — checkpoint til næste session

**Opdateret:** 2026-09-27 · **Repo:** `C:\Dev\elta-crm` (`main` = prod-deploy via Vercel) · **Backlog:** [AUTONOMOUS_BACKLOG.md](AUTONOMOUS_BACKLOG.md)

## Overnight run 2026-10-01 → (løbende checkpoint)
**Start:** 2026-10-01 20:18 dansk (18:18 UTC) · start-commit `4606dde`

| Tid (dansk) | Checkpoint |
|---|---|
| 20:18 | Start. Full regression U1–U39 kører. Forberedt: e-conomic-tjekliste "Fakturerede kunder koblet". |
| ~21:00 | `88ab138`: montør-visning uden priser (D18), Kopiér tilbud (N15), omplanlægning verificeret (N16), portal-faktura-PDF (D19), bank-advarsel (G12 — prod mangler bankoplysninger!), e-conomic-tjekliste kunder. U40–U43 grønne. `2c9daa3`: gotoSafe (regression U1–U39 væltede på navigations-timeout, ikke app-fejl). Full regression U1–U43 kører. |
| 21:35 | Regression U1–U43: 42/43 (U18 timing-flake → robust vent, grøn alene). `01387ef`: Mine timer (N17), Kun mine på leads (N18), forfald dansk kalender (D20); U44–U45 grønne. Full regression U1–U45 startet. |

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
