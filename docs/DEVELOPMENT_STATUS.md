# Development status — checkpoint til næste session

**Opdateret:** 2026-09-27 · **Repo:** `C:\Dev\elta-crm` (`main` = prod-deploy via Vercel) · **Backlog:** [AUTONOMOUS_BACKLOG.md](AUTONOMOUS_BACKLOG.md)

## Nu
P0–P2 + P2-rest A–C DONE. P3 #15 (Relatel) + #16 (opfølgningsmotor) DONE som discovery/foundation. **Næste: P3 #17** (grossist/KlarPris), #18 (Profit Engine), #19 (Invoice Control).
**Venter på Henrik:** prod-migration 00163 (agent capability-guard) · kundemail-crons (NB: fakturarykkere har aldrig virket i prod; rettes de, sendes straks rykker på 83 d forfalden faktura) · anon-crons · Relatel-token + trin 1–5 · pilotbrugere · agent-aktivering.

## Staging-state at kende
- 00159, 00160, 00161, 00162, 00163 anvendt · view-parity (security_invoker på betalings-views) anvendt · agent_configs seedet.
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
| Statisk ops | `ui:guard-audit` · `ops:cron-check` · `ops:incident-check` |
| Staging migration | `npm run harness:migrate-staging -- <nr>` |
| Prod read-only | `prod:db-audit` · `prod:verify-00162` · `prod:verify-00161` · `prod:role-policies` · `prod:pilot-health` · `prod:storage-audit` · `prod:verify-00159/00160` · `npx tsx scripts/prod-cron-discovery.ts` |
| Kode | `npm run type-check` · `harness:typecheck` · `build` · unit: `npx tsx scripts/agent-*-test.ts` |
| Flag | `npm run safety:flags` |

## Seneste milepæle
- 2026-09-27: 00160 (RLS) + 00159 (offers.source_case_id) kørt i prod, verificeret; Pilot Ops PROD READY.
- 2026-09-27: P0 #1–#4 (R1–R4) lukket på staging + regressionsværn; 00161 forberedt (gate); R3-kode i prod.
