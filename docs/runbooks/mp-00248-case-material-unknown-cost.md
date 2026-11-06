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
- Kostkolonnerne kan ikke læses direkte: `authenticated` mister tabel-SELECT og får kolonne-SELECT på alle andre kolonner (som 00192/00201). Kost læses kun af app'en med admin-klienten bag den effektive rettighed `materials.view.cost_prices` og kun for rækker brugerens egen klient har returneret (`src/lib/materials/case-material-costs.ts`).
- `work_order_profit.material_cost`, `total_cost`, `profit` og `margin_percentage` bliver nullable uden standardværdi.
- `calculate_work_order_profit` og `snapshot_work_order_profit` opdateres.

### Skrive-værn på kosten (§6)
Trigger `case_materials_cost_write_guard` (SECURITY INVOKER, som 00150) på `BEFORE INSERT` og `BEFORE UPDATE OF unit_cost`.
For en API-session (`anon`/`authenticated`) UDEN den effektive rettighed `materials.view.cost_prices`:

| Handling | Resultat |
|---|---|
| INSERT med `unit_cost` = tal (også 0) | afvist, 42501 |
| INSERT uden `unit_cost` eller med NULL | tilladt (ukendt kost) |
| UPDATE hvor `unit_cost` står i SET (samme værdi, anden værdi, NULL → tal, tal → NULL, upsert) | afvist, 42501 |
| UPDATE af ufarlige felter (antal, beskrivelse, noter, …) | uændret (række-politikkerne afgør) |
| `total_cost` | genereret; kan ikke skrives af nogen |

- Afvisningen sammenligner aldrig med den gemte kost, så accept/afvisning er ikke et orakel. Fejlteksten har ingen beløb.
- `service_role`/`postgres` gates ikke: app'ens egne, gatede stier (leverandørfaktura-konvertering, admin-klient) og
  SECURITY DEFINER-triggere.
- App: `updateCaseMaterial` skriver kun kost i revisionssporet, når brugeren har kost-retten (ellers ville en skjult
  kost stå som "null → null", og aktøren kan læse sin egen revisionsrække).
- Bevidst uden for værnet: at ændre antal ændrer `total_cost` (antal × kendt kost) — antal er et ufarligt felt.
  Sletning + ny linje med ukendt kost er almindelig materialehåndtering (række-politikken for DELETE afgør).

### Materialeskrivning efter effektive rettigheder og sags-scope (§8)
Før (00173): INSERT `user_role() IN (admin, serviceleder, montør)`, UPDATE/DELETE `user_role() IN (admin, serviceleder)`,
intet sags-scope i databasen. Efter (samme politiknavne; `write-matrix.ts` `supersededBy: 00248`):

| Politik | Krav |
|---|---|
| INSERT | `materials.add_to_case` + sagen i scope + evt. arbejdsordre hører til samme sag (og er synlig) |
| UPDATE (USING) | `materials.edit` + sagen i scope |
| UPDATE (WITH CHECK) | `materials.edit` + sagen i scope + evt. arbejdsordre hører til samme sag |
| DELETE | `materials.delete` + sagen i scope |

- Scope = præcis samme udtryk som læsepolitikken (00242): `cases.view.all` ELLER sagen i `my_case_scope_ids()`. En
  skrive-ret rækker dermed aldrig ud over læse-scopet.
- Nøglerne er de samme, som app'en tjekker (`createCaseMaterial` / `updateCaseMaterial` / `deleteCaseMaterial`).
- `case_id` kan ikke ændres via API'et (`trg_case_materials_case_lock`, 42501). App'en har intet flyt-flow.
- Fejl: en fremmed og en ikke-eksisterende sag giver samme RLS-fejl uden sags-id; rækker uden for scope rammes
  aldrig (0 rækker) ved UPDATE/DELETE.
- Admin-klienten (service_role) er uændret: fakturering, leverandørfaktura-konvertering og test-oprydning.
- Rollback genskaber 00173-politikkerne ordret; rollback-beviset sammenligner med en gemt tilstand fra før anvendelse
  (`cli.ts mp-00248-state --save <fil>` før apply, `cli.ts mp-00248-rollback-proof --pre <fil>`).

### work_order_profit efter effektive rettigheder (§7)
Før (00192): `USING (user_role() IN ('admin','serviceleder','bogholderi'))` — en per-bruger REVOKE ændrede intet.
Efter (samme politiknavn, `SELECT_REPLACED` uændret):
```sql
USING ((SELECT user_has_permission('economy.cost_prices'))
   AND (SELECT user_has_permission('materials.view.cost_prices'))
   AND EXISTS (SELECT 1 FROM work_orders w WHERE w.id = work_order_profit.work_order_id))
```
- Begge nøgler: snapshottet har både time- og materialekost; med kun den ene kunne den anden regnes ud. Standardrollerne
  har begge (admin/serviceleder/bogholderi) → uændret for dem.
- Scope: ordren skal være synlig via work_orders-RLS (00242). Admin/serviceleder (`work_orders.view.all`) og bogholderi
  (`cases.view.all`) ser alt som før; en montør med GRANT ser kun egne ordrer.
- `snapshot_work_order_profit` mister EXECUTE for `authenticated` (00088 gav den). Kaldes kun af admin-klienten og af
  SECURITY DEFINER-triggerne (00171/00222). `calculate_work_order_profit` var allerede lukket (00192).
- App-læsere af `work_order_profit` bruger alle admin-klienten (`lib/services/profitability.ts`, `lib/ai/*`). Eneste
  aktive indgang er `/api/dashboard/ai-insights`, som nu kræver begge nøgler. `suggestOfferImprovements` har ingen kaldere.

## Data
Ingen konvertering. Prod 2026-11-05: 4 rækker, 0 med `unit_cost = 0`, 0 med NULL, 0 snapshots.

## Rækkefølge i prod
**PUSH → MIGRATION → POST-CHECK** (den normale rækkefølge):
- Gammel kode læser kosten med bruger-klienten og fejler efter migrationen, så koden skal ud først.
- Ny kode læser aldrig kosten med bruger-klienten og virker på begge skemaer.
- Mellem push og migration afviser databasen en montør-linje uden kost (NOT NULL). Handlingen fejler synligt, og intet gemmes som 0. Hold vinduet kort.

Når prod-migrationen er kørt, skal tjekket `case_materials.unit_cost uændret (NOT NULL, ingen 00248)` i `scripts/prod-smoke-grok-batch-3.ts` opdateres.

## Rollback
`docs/runbooks/mp-00248-rollback.sql`.
- Afviser, hvis der findes NULL-rækker eller snapshots med ukendt avance. Intet sættes stille til 0.
- Rækkerne skal først have en kendt kost eller slettes efter en menneskelig gennemgang.
- Rul koden tilbage først. Gammel kode læser NULL som 0.

## Prøver
- `npx tsx scripts/case-material-unknown-cost-test.ts`: ren logik og statiske værn.
- `cli.ts mp-00248-state`: fingeraftryk før/efter (read-only).
- `cli.ts mp-00248-probe`: rollback-only. Kendt, 0 og ukendt kost, total, avance, snapshot, rollback-værn, montør-session,
  skrive-værn (montør, serviceleder standard og med REVOKE, montør med GRANT) og avance-synlighed (inkl. scope og admin).
- `cli.ts mp-00248-api`: rigtige persona-klienter mod PostgREST og loaderen, inkl. per-bruger GRANT og REVOKE, direkte
  INSERT/PATCH/upsert af kost og `work_order_profit` for montør, serviceleder (standard, REVOKE af hver nøgle) og admin.
- `cli.ts mp-00248-state --save <fil>`: FØR apply — gemmer tilstanden rollback skal genskabe.
- `cli.ts mp-00248-rollback-proof --pre <fil>`: kun staging, efter apply. Rollback skal give præcis tilstanden fra
  `--pre` (politikker, grants, kolonne-grants, triggere, funktioner, skema); gen-anvendelse og uændrede rækker.
- `cli.ts wo-profit`: P7 og P8.
- UI: `UI_E2E_ONLY=U264`.

## Afledte fund, ikke løst her (holdes adskilt)
- `case_other_costs.unit_cost`/`total_cost`: kan læses direkte af montør på egne sager, og kosten kan skrives uden
  kost-ret; samme NOT NULL DEFAULT 0-problem (falsk 0).
- `kalkia_variant_materials.cost_price` har kolonne-SELECT for `authenticated`; RLS ikke gennemgået her.
- Ukendt timekost i tilbud-mod-faktisk.
- Det gamle `low_profit`-flag / `trg_profit_snapshot_flag_low` skal ryddes op.
- `unit_sales_price` gemmes stadig som 0 for montørens linjer.
- Finans-batch 2.
