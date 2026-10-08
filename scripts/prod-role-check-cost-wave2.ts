/**
 * PRODUCTION read-only: rolle-tjek for kost-lockdown bølge 2 (00200/00201) SOM rigtige prod-brugere (SET LOCAL ROLE
 * authenticated + JWT-claims, READ ONLY, rulles tilbage). Kun rolle, tjek og antal — ingen data.
 *   npx tsx scripts/prod-role-check-cost-wave2.ts pre    — FØR migrationen (montør kan læse = forventet "åben")
 *   npx tsx scripts/prod-role-check-cost-wave2.ts post   — EFTER (kost-roller ser alt, andre intet; cost_price nægtet)
 */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const ROLE_SCOPED = ['price_history', 'supplier_product_cache', 'customer_product_prices', 'supplier_margin_rules', 'materials_catalog',
  'material_price_history', 'calc_components', 'calc_component_materials', 'kalkia_nodes', 'kalkia_variant_materials', 'package_items',
  'calculation_rows', 'kalkia_calculations', 'calibration_presets', 'quick_jobs', 'customer_supplier_prices', 'calculations']
const COST = new Set(['admin', 'serviceleder', 'bogholderi'])

withProdReadOnlyRoleProbe(`prod-role-check-cost-wave2-${mode}`, async (probe, run) => {
  const users = await run(`SELECT p.role, (array_agg(p.id ORDER BY p.created_at))[1]::text AS id FROM profiles p
    WHERE p.is_active AND p.role IN ('admin', 'montør', 'salg', 'serviceleder', 'bogholderi') GROUP BY p.role ORDER BY p.role`)
  const res: Array<[string, boolean, string]> = []
  for (const u of users as Array<{ role: string; id: string }>) {
    for (const t of ROLE_SCOPED) {
      const total = ((await run(`SELECT count(*)::int n FROM public.${t}`)) as Array<{ n: number }>)[0].n
      const r = await probe(u.id, `SELECT count(*)::int n FROM public.${t}`)
      const seen = r.ok ? Number(r.rows[0]?.n) : -1
      const want = mode === 'pre' ? total : COST.has(u.role) ? total : 0
      res.push([`${u.role}: ${t} ${mode === 'pre' ? 'læsbar (før)' : COST.has(u.role) ? 'alle rækker' : 'ingen rækker'}`, seen === want, `${seen}/${total}`])
    }
    const pc = await probe(u.id, `SELECT cost_price FROM public.product_catalog LIMIT 1`)
    res.push([`${u.role}: product_catalog.cost_price ${mode === 'pre' ? 'læsbar (før)' : 'nægtet'}`, mode === 'pre' ? pc.ok : !pc.ok && pc.code === '42501', pc.ok ? 'LÆSBAR' : pc.code])
    const pub = await probe(u.id, `SELECT count(list_price)::int n FROM public.product_catalog`)
    res.push([`${u.role}: product_catalog offentlige kolonner læsbare`, pub.ok, pub.ok ? `${pub.rows[0]?.n} rækker` : pub.code])
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}  (${note})`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} rolle-tjek som forventet (${mode}; roller: ${(users as Array<{ role: string }>).map((u) => u.role).join(', ')})`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
