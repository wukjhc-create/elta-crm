/**
 * PRODUCTION read-only (OF-3, review 2026-10-17): findes offer_line_items.total_price, og hvad indsætter RPC'en
 * insert_package_into_offer? Kun skemaoplysninger.
 *   npx tsx scripts/prod-offer-line-columns.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-offer-line-columns', async (run, masked) => {
  const cols = (await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='offer_line_items'
    AND column_name IN ('total','total_price','sale_price','line_type') ORDER BY 1`)) as Array<{ column_name: string }>
  const fn = (await run(`SELECT p.proname, position('total_price' in pg_get_functiondef(p.oid)) > 0 AS uses_total_price
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('insert_package_into_offer','apply_package_to_offer')`)) as Array<{ proname: string; uses_total_price: boolean }>
  console.log(`prod:${masked} kolonner=${JSON.stringify(cols.map((c) => c.column_name))} funktioner=${JSON.stringify(fn)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
