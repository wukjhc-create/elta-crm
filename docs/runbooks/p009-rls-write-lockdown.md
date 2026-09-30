# Runbook — P-009 RLS-skrivelås (runde for runde)

**Status:**
- **Runde 1 (00170):** anvendt og verificeret på staging (2026-09-30). **IKKE kørt i production.** Kræver Henriks godkendelse.

## Model
- **Én kilde:** `scripts/rls/write-matrix.ts`. Pr. tabel står de roller, der må INSERT/UPDATE/DELETE, plus evt. ekstra betingelser (fx `created_by = auth.uid()`, forslag-sletning).
- **Least privilege** betyder præcis de roller, som appen skriver med via bruger-sessionen:
  - Rollerne er AST-kortlagt med `scripts/rls-write-sites.ts`, inklusive kaldere, hjælpere og service-lag.
  - Service-role (cron, portal, sync) påvirkes ikke af RLS.
- Læsning (SELECT) ændres ikke. Anon mister alle tabel-grants.
- **Genereret SQL:** `npx tsx scripts/rls/build-migration.ts <nr> <WAVE>`.
- **CI (`npm run check:rls-matrix`)** fejler, hvis:
  - app-kode skriver som en rolle, matrixen ikke tillader (lockdown ville bryde et flow),
  - en migrationsfil er drevet fra matrixen.
- **Staging-bevis (`npm run harness:rls-lockdown -- <WAVE>`):**
  - rigtige rolle-sessioner (5 personaer) + anon,
  - pr. tabel: INSERT/UPDATE/DELETE, både positive og negative,
  - ekstra betingelser,
  - læsning uændret.

## Runde 1 — 00170
| Tabel | INSERT | UPDATE | DELETE |
|---|---|---|---|
| customers | admin, serviceleder, salg, montør¹ | admin, serviceleder, salg | admin |
| customer_contacts | admin, serviceleder, salg, montør¹ | admin, serviceleder, salg | admin, serviceleder, salg |
| offers | admin, serviceleder, salg + `created_by = uid` | admin, serviceleder, salg | admin; serviceleder/salg kun `is_proposal` |
| offer_line_items | admin, serviceleder, salg | admin, serviceleder, salg | admin, serviceleder, salg |
| portal_access_tokens | admin, serviceleder, salg + `created_by = uid` | admin, serviceleder, salg | admin |
| customer_documents | alle 5 roller² | admin, serviceleder, montør, salg | admin |
| incoming_emails | admin, serviceleder, montør, salg | alle 5 roller³ | admin |

¹ opret kunde/kontakt fra mail (`inbox.view`) · ² upload er `customers.view` · ³ læst-markering fra kundekortet er `customers.view`.

**Målt på staging:**
- `harness:rls-lockdown` WAVE1: 7/7 tabeller, 172 checks med rigtige sessioner.
- Regression grøn:
  - `security`, `pilot-roles`, `flows`, `agent-gating`, `agent-actions`, `exemption-proofs`, `action-auth`,
  - `invoice-*`, `supplier-*`,
  - `db-audit` HØJ/MIDDEL 0 (LAV 108→101).

**Pre-check prod (read-only):** `npx tsx scripts/prod-verify-rls-wave.ts WAVE1 pre`
- 14 åbne skrive-policies på 7/7 tabeller, og alle droppes af migrationen.
- Anon-grants på `customer_contacts` og `incoming_emails`.

## Udførelse (efter godkendelse)
1. Tilføj `'00170'` til allowlist i `scripts/prod-apply-migration.ts`.
2. `npx tsx scripts/prod-verify-rls-wave.ts WAVE1 pre` → ✅
3. `npm run prod:apply-migration -- 00170 --approved-by-henrik`
4. `npx tsx scripts/prod-verify-rls-wave.ts WAVE1 post`. Tjekker:
   - ingen åbne skrive-policies,
   - anon har 0 grants,
   - de genererede policies findes,
   - rolle-prædikaterne pr. prod-persona er som matrixen.
5. Kør `prod:db-audit`, `prod:role-policies`, `prod:pilot-health` og `scripts/prod-write-policies.ts`. Tallet skal falde med 7 tabeller.
6. Smoke-test som montør:
   - åbn mail og opret kunde fra mail (skal virke),
   - prøv at rette en kunde (skal afvises, som i appen).

## Rollback
Genskab de droppede policies (navne står i DROP-linjerne) som `USING (true)` / `WITH CHECK (true)` for authenticated.
