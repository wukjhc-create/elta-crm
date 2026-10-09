/**
 * PRODUCTION read-only: kan 'authenticated' læse kost-/avance-/rabatkolonner i tabeller der er læsbare for alle?
 * Kun ja/nej pr. kolonne.   npx tsx scripts/prod-cost-column-privs.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-cost-column-privs', async (run, masked) => {
  const rows = await run(`SELECT table_name tbl, column_name col,
      has_column_privilege('authenticated', format('public.%I', table_name), column_name, 'SELECT') auth_select
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('supplier_products', 'offer_line_items', 'invoice_lines', 'packages', 'offer_package_items', 'materials', 'kalkia_variants', 'kalkia_calculation_rows', 'solar_products', 'product_catalog', 'work_orders', 'service_cases', 'offers', 'sent_quotes')
      AND (column_name ILIKE '%cost%' OR column_name ILIKE '%margin%' OR column_name ILIKE '%discount%' OR column_name ILIKE '%purchase%' OR column_name ILIKE '%net_price%' OR column_name ILIKE '%profit%' OR column_name ILIKE 'db_%')
    ORDER BY 3 DESC, 1, 2`)
  console.log(`--- kost-kolonner @ prod:${masked} ---`)
  for (const r of rows as Array<{ tbl: string; col: string; auth_select: boolean }>) console.log(`${r.auth_select ? 'LÆSBAR ' : 'lukket  '} ${r.tbl}.${r.col}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
