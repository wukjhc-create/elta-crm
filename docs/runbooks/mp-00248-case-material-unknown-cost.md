# 00248: ukendt materialekost

**Status:** kode og migration klar. Kun prod kræver Henriks særskilte godkendelse.

## Problem
`case_materials.unit_cost` var `NOT NULL DEFAULT 0`. Ukendt kost blev gemt som 0,00 og talte som en gratis vare, så avance og DB blev for høje. Montørens linjer ramte det hver gang.

## Regel
- Kendt kost: endeligt tal, også 0 og negativ returlinje.
- Ukendt kost: `NULL`.
- Aldrig `NULL → 0` i kost, avance eller rapporter. Fælles kode: `src/lib/cases/material-cost.ts`.

## DDL

Før:
```sql
unit_cost  NUMERIC(12,2) NOT NULL DEFAULT 0
total_cost NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
```

Efter:
```sql
unit_cost  NUMERIC(12,2) CHECK (unit_cost IS NULL OR unit_cost <> 'NaN'::numeric)
total_cost NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED  -- uændret, giver selv NULL
```

Derudover:
- `work_order_profit.material_cost`, `total_cost`, `profit` og `margin_percentage` bliver nullable uden standardværdi.
- `calculate_work_order_profit` og `snapshot_work_order_profit` opdateres.

## Data
Ingen konvertering. Prod 2026-11-05: 4 rækker, 0 med `unit_cost = 0`, 0 med NULL, 0 snapshots.

## Rækkefølge i prod
**MIGRATION → POST-CHECK → PUSH.** Det er en bevidst afvigelse fra CODE → PUSH → MIGRATION:
- Ny kode skriver NULL og fejler på montørens "Tilføj materiale", så længe kolonnen er NOT NULL.
- Gammel kode skriver altid tal, så den tåler den nye kolonne, indtil ny kode skriver den første NULL.

Når prod-migrationen er kørt, skal tjekket `case_materials.unit_cost uændret (NOT NULL, ingen 00248)` i `scripts/prod-smoke-grok-batch-3.ts` opdateres.

## Rollback
`docs/runbooks/mp-00248-rollback.sql`.
- Afviser, hvis der findes NULL-rækker eller snapshots med ukendt avance. Intet sættes stille til 0.
- Rækkerne skal først have en kendt kost eller slettes efter en menneskelig gennemgang.
- Rul koden tilbage først. Gammel kode læser NULL som 0.

## Prøver
- `npx tsx scripts/case-material-unknown-cost-test.ts`: ren logik og statiske værn.
- `cli.ts mp-00248-state`: fingeraftryk før/efter (read-only).
- `cli.ts mp-00248-probe`: rollback-only. Kendt, 0 og ukendt kost, total, avance, snapshot, rollback-værn, montør-session.
- `cli.ts mp-00248-rollback-proof`: kun staging. Rollback og gen-anvendelse, rækkerne skal være uændrede.
- `cli.ts wo-profit`: P7 og P8.
- UI: `UI_E2E_ONLY=U264`.

## Afledte fund, ikke løst her
- Montør kan læse `unit_cost` direkte via API'et på egne sager. Findes allerede, se `cost-columns-case-materials-proposal.md`.
- `case_other_costs.unit_cost` har samme NOT NULL DEFAULT 0-problem.
- `unit_sales_price` gemmes stadig som 0 for montørens linjer.
