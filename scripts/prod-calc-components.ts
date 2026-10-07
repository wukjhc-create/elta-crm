/**
 * PRODUCTION read-only: ELTAs egne komponenter (calc_components) — kode, navn, salgspris, tid, kategori. Til S2
 * (AI-projektmotoren skal bruge egne priser/tider i stedet for indbyggede standardværdier). Ingen personværdier.
 *   npx tsx scripts/prod-calc-components.ts [kode1,kode2,…]
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const codes = String(process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean)

withProdReadOnly('prod-calc-components', async (run) => {
  const [n] = await run(`SELECT count(*)::int total, count(*) FILTER (WHERE is_active)::int aktive, count(*) FILTER (WHERE code IS NULL)::int uden_kode FROM calc_components`)
  console.log(`calc_components: ${n.total} i alt, ${n.aktive} aktive, ${n.uden_kode} uden kode`)
  const rows = await run(`
    SELECT c.code, c.name, c.default_sale_price::float AS salg, c.default_cost_price::float AS kost, c.base_time_minutes AS min,
           c.is_active, cat.name AS kategori
      FROM calc_components c LEFT JOIN calc_component_categories cat ON cat.id = c.category_id
     ${codes.length ? `WHERE c.code = ANY(ARRAY[${codes.map((c) => `'${c.replace(/'/g, "''")}'`).join(',')}])` : ''}
     ORDER BY cat.name NULLS LAST, c.code
     LIMIT 200`)
  for (const r of rows) console.log(`${r.is_active ? ' ' : 'x'} ${String(r.code).padEnd(22)} ${String(r.name).slice(0, 34).padEnd(34)} salg=${r.salg} kost=${r.kost} tid=${r.min}m  [${r.kategori ?? '-'}]`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
