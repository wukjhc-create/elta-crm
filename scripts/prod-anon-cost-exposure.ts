/**
 * PRODUCTION read-only: kan ANON (offentlig nøgle, ingen login) læse kost-tabeller? SELECT-politikker for anon/public,
 * tabel-/kolonne-privilegier for anon og antal rækker med kostpris. Kun metadata + antal.
 *   npx tsx scripts/prod-anon-cost-exposure.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const TABLES = ['product_catalog', 'price_history', 'supplier_product_cache', 'customer_supplier_prices', 'customer_product_prices',
  'supplier_margin_rules', 'materials_catalog', 'material_price_history', 'calc_components', 'calc_component_materials', 'kalkia_nodes',
  'kalkia_variant_materials', 'package_items', 'calculations', 'calculation_rows', 'kalkia_calculations', 'calibration_presets', 'quick_jobs']
const q = TABLES.map((t) => `'${t}'`).join(',')

withProdReadOnly('prod-anon-cost-exposure', async (run, masked) => {
  const rows = (await run(`SELECT t.table_name tbl,
      has_table_privilege('anon', 'public.' || t.table_name, 'SELECT') anon_table_select,
      (SELECT string_agg(p.policyname, ' | ') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.table_name
        AND p.cmd IN ('SELECT', 'ALL') AND ('anon' = ANY (p.roles) OR 'public' = ANY (p.roles))) anon_policies
    FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name IN (${q}) ORDER BY 1`)) as Array<{ tbl: string; anon_table_select: boolean; anon_policies: string | null }>
  console.log(`--- anon-adgang til kost-tabeller @ prod:${masked} ---`)
  for (const r of rows) {
    const exposed = r.anon_table_select && !!r.anon_policies
    let n = ''
    if (exposed) {
      const [c] = (await run(`SELECT count(*)::int n FROM public.${r.tbl}`)) as Array<{ n: number }>
      n = ` · rækker=${c.n}`
    }
    console.log(`${exposed ? 'EKSPONERET' : 'lukket   '}  ${r.tbl.padEnd(28)} anon-grant=${r.anon_table_select} politik=${r.anon_policies ?? '-'}${n}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
