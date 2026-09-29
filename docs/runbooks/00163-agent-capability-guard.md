# Runbook — prod-migration 00163: DB-side capability-guard for Agent Core

**Status:** ✅ **KØRT i production 2026-09-29** (godkendt af Henrik). Pre-check og read-only post-check er grønne. Den afsluttende suite er grøn: `prod:db-audit` HØJ/MIDDEL 0 (LAV 109), `prod:role-policies` 0·0·0, `prod:storage-audit` ingen huller, `prod:verify-00161/00162/00163` grønne, `prod:pilot-health` 🟢, agents 7/7 disabled/suggest, AUTO_CREATE og AGENT_LIVE_SEND OFF, 0 kundemails og 0 finance-writes (`scripts/prod-safety-confirm.ts`). Verifikation: `npm run prod:verify-00163` (8 capabilities = register, trigger aktiv/SECURITY DEFINER/search_path låst). Trigger-adfærd er bevist på staging (`harness:agent-gating` 13/13).
**Prioritet:** middel. Det er defense-in-depth. Executor lukker allerede hullet i koden (2784b5d), og kun service-role skriver `agent_actions`. Ingen agent er aktiveret i prod.

## Hvad
- Ny tabel `agent_capabilities` (8 rækker) som spejl af capability-registeret, med RLS (SELECT kun admin, ingen anon).
- Ny trigger `trg_agent_actions_capability_guard` (BEFORE INSERT OR UPDATE på `agent_actions`) afviser fail-closed, når:
  - capabilityen er ukendt,
  - `side_effect_class` ikke matcher capabilityen,
  - `requires_approval` eller `min_approvals` er løsere end capabilityen,
  - runnets agent ikke er tilladt,
  - `capability` ændres efter oprettelse.
- Triggeren afviser også overgang til `executing`/`executed` uden gyldig approval for **alle** approval-capabilities. Før gjaldt det kun hard-blocked klasser.
- Ingen data ændres.

## Målt på staging
| Test | Resultat |
|---|---|
| `harness:agent-gating` | 13/13. DB afviser: klasse-mismatch, forkert agent, fjernet approval, ukendt capability, send uden approval, UPDATE der løsner, status→executing uden approval. Positiv kontrol udført. DB-spejl = register. |
| `harness:security` · `pilot` · `concurrency` · `agent-actions` · `planning-flow` · `ui-states` · `health-snapshot` | grønne (legitime flows upåvirkede) |

## Prod pre-check (read-only, 2026-09-28)
`npx tsx scripts/prod-precheck-00163.ts` gav: 4 eksisterende actions i 3 grupper opfylder alle guarden, og `agent_capabilities` findes ikke endnu.

## Udførelse (efter godkendelse)
1. Tilføj `'00163': '<dato>'` til allowlist i `scripts/prod-apply-migration.ts`.
2. `npx tsx scripts/prod-precheck-00163.ts` skal være ✅.
3. `npm run prod:apply-migration -- 00163 --approved-by-henrik`
4. Post-check: `npm run prod:db-audit` (HØJ/MIDDEL 0) · `npm run prod:pilot-health` 🟢. Kontrollér desuden i prod-read-only, at `SELECT count(*) FROM agent_capabilities` = 8, og at triggeren findes.

## Fremover
En ny capability kræver en migration med en række i `agent_capabilities`, ellers afviser DB'en dens actions. `harness:agent-gating` S4 fejler, hvis registeret og DB-spejlet afviger.

## Rollback
Se migrationens header (DROP TRIGGER / FUNCTION / TABLE). Ingen data ændres.
