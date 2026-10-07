/**
 * PRODUCTION read-only: hvilke kost-/rabat-/avance-tabeller kan salg/montør LÆSE direkte via REST (egen session)?
 * Viser SELECT-politikker for `authenticated` og om kost-kolonnerne har kolonne-SELECT for authenticated. Ingen data.
 *   npx tsx scripts/prod-cost-table-read-policies.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const TABLES = ['price_history', 'supplier_product_cache', 'customer_supplier_prices', 'customer_product_prices', 'supplier_margin_rules',
  'product_catalog', 'calc_components', 'calc_component_materials', 'calc_component_variant_materials', 'kalkia_nodes',
  'kalkia_variant_materials', 'materials_catalog', 'material_price_history', 'package_items', 'kalkia_calculations',
  'calculations', 'calculation_rows', 'offer_line_items', 'supplier_products', 'time_logs', 'employees', 'quick_jobs', 'calibration_presets',
  'calculation_settings', 'work_order_profit', 'employee_compensation']
const COST_COLS = ['cost_price', 'old_cost_price', 'new_cost_price', 'cached_cost_price', 'discount_percentage', 'custom_margin_percentage',
  'margin_percentage', 'default_cost_price', 'supplier_cost_price_at_creation', 'supplier_margin_applied', 'cost_amount', 'cost_rate',
  'hourly_rate', 'estimated_cost_price', 'real_hourly_cost', 'internal_cost_rate', 'hourly_wage', 'profit', 'labor_cost', 'material_cost']
const q = (a: string[]) => a.map((x) => `'${x}'`).join(',')

withProdReadOnly('prod-cost-table-read-policies', async (run, masked) => {
  const rows = await run(`SELECT t.table_name tbl,
      (SELECT string_agg(p.policyname || ' [' || coalesce(nullif(p.qual, ''), '-') || ']', ' | ')
         FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.table_name AND p.cmd IN ('SELECT', 'ALL')
          AND ('authenticated' = ANY (p.roles) OR 'public' = ANY (p.roles))) select_policies,
      (SELECT string_agg(c.column_name, ',') FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name IN (${q(COST_COLS)})
           AND has_column_privilege('authenticated', 'public.' || t.table_name, c.column_name, 'SELECT')) cost_cols_readable
    FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name IN (${q(TABLES)}) ORDER BY 1`)
  console.log(`--- kost-tabeller: SELECT for authenticated @ prod:${masked} ---`)
  for (const r of rows as Array<{ tbl: string; select_policies: string | null; cost_cols_readable: string | null }>) {
    console.log(`${r.tbl.padEnd(34)} læsbare kost-kolonner: ${r.cost_cols_readable ?? '-'}\n    politikker: ${(r.select_policies ?? '-').slice(0, 220)}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
