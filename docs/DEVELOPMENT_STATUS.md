# Development status — checkpoint til næste session

**Opdateret:** 2026-09-27 · **Repo:** `C:\Dev\elta-crm` (`main` = prod-deploy via Vercel) · **Backlog:** [AUTONOMOUS_BACKLOG.md](AUTONOMOUS_BACKLOG.md)

## Nu
P0 #1–#4 DONE (staging; R3-kode deployet). **Næste: P1 #5** (udvid audit af alle rollefølsomme tabeller — brug
`analyseViews`/`analyseSecretColumns`/`READ_POLICY` i `scripts/test-harness/role-matrix.ts`; husk SECURITY DEFINER-
funktioner/RPC'er der returnerer følsomme data).
Venter på Henrik: prod-migration 00161 (runbook `docs/runbooks/00161-rls-residual-risks.md`; tilføj til allowlist
i `scripts/prod-apply-migration.ts` først) · navne på pilotbrugere.

## Staging-state at kende
- 00159, 00160, 00161 anvendt · view-parity (security_invoker på betalings-views) anvendt · agent_configs seedet.
- `npm run harness:pilot-roles` = fuld rolle-regression (matrix + skrive/update-probes + R1–R4 35 checks + views + hemmelige kolonner).
- Latent fund P-003: `api/cron/supplier-sync` bruger anon-klient (→ backlog #9, ændr ikke uden beslutning).

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
| Staging regression | `npm run harness:security` · `harness:pilot` · `harness:pilot-roles` · `harness:status` |
| Staging migration | `npm run harness:migrate-staging -- <nr>` |
| Prod read-only | `prod:role-policies` · `prod:pilot-health` · `prod:storage-audit` · `prod:verify-00159/00160` |
| Kode | `npm run type-check` · `harness:typecheck` · `build` · unit: `npx tsx scripts/agent-*-test.ts` |
| Flag | `npm run safety:flags` |

## Seneste milepæle
- 2026-09-27: 00160 (RLS) + 00159 (offers.source_case_id) kørt i prod, verificeret; Pilot Ops PROD READY.
- 2026-09-27: P0 #1–#4 (R1–R4) lukket på staging + regressionsværn; 00161 forberedt (gate); R3-kode i prod.
