# UI-harness — kørselsregler

**Opdateret:** 2026-10-16

## Før hver UI-kørsel
1. `npx tsx scripts/test-harness/cli.ts auth-probe --create` — staging falder ud i perioder; stop ved fejl.
2. Rør ikke `src/` mens en kørsel bygger: hver kørsel (`kørsel N/M (+build)`) bygger fra arbejdstræet.

## Grupper (UI_E2E_GROUPS i `scripts/test-harness/ui-e2e.ts`)
- **Kommasepareret i ét argument:** `npm run -s harness:ui-full -- sales,portal-mail`
- **Aldrig mellemrum:** `-- sales portal-mail` kørte før kun `sales` — den anden gruppe blev tavst droppet med exit 0
  (opdaget 2026-10-16, da PASS-antallet var for lavt). `ui-full` afviser nu ekstra argumenter med exit 2.
- Tjek altid PASS-antallet mod gruppernes størrelse i oversigten `=== UI-FULL (...) — N tests ===`.

## Målrettede batches
- `npm run -s harness:ui-batches -- U11,U70,U43 U12,U155` — her er mellemrum = ny batch (á højst 5 tests), komma = samme batch.
- Afhængigheder (`DEPS` i `ui-batches.ts`) lægges selv til; tests der kræver seed fra en anden test (fx U174 → U11) skal
  have en DEPS-linje, ellers bliver de NOT_RUN.

## Lokal build-ustabilitet
`next build` fejler af og til med `lstat 'C:\'` / "Failed to collect page data" → alle tests NOT_RUN. Det er ikke en
kodefejl: kontrollér at ingen node-processer hænger, og kør igen.

## Nye tests
- Registreres i den relevante gruppe-array (fx `sales` i `ui-e2e.ts`).
- `scripts/` er uden for tsc — kør `npx esbuild scripts/test-harness/ui-e2e.ts --format=esm --platform=node --log-level=error > /dev/null` som syntakstjek.
- Mobil-lister placeres EFTER tabellen i DOM, ellers rammer `getByText(...).first()` den skjulte liste.
