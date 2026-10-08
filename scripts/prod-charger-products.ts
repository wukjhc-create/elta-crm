/**
 * PRODUCTION read-only: hvilke ladestandere/ladebokse findes i leverandør-kataloget (supplier_products)?
 * Til ELTA Assistant/S2: laderens hardware skal komme fra produktkataloget. Kun produktdata (ingen personværdier).
 *   npx tsx scripts/prod-charger-products.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const term = String(process.argv[2] || '').replace(/[^A-Za-z0-9 æøåÆØÅ.-]/g, '')
withProdReadOnly('prod-charger-products', async (run) => {
  const where = term ? `sp.supplier_name ILIKE '%${term}%'` : `(sp.supplier_name ILIKE ANY(ARRAY['%ladeboks%','%ladestander%','%lader til elbil%','%elbillader%','%wallbox%','%easee%','%zaptec%','%ev charger%','%charge amps%','%charging station%'])
                 OR sp.manufacturer ILIKE ANY(ARRAY['%easee%','%zaptec%','%wallbox%','%charge amps%','%defa%','%clever%'])
                 OR sp.category ILIKE ANY(ARRAY['%elbil%','%ladeboks%','%ladestander%','%e-mobility%','%emobility%']))`
  const [n] = await run(`SELECT count(*)::int n, count(*) FILTER (WHERE sp.is_available)::int tilg FROM supplier_products sp WHERE ${where}`)
  console.log(`kandidater: ${n.n} (tilgængelige: ${n.tilg})`)
  const rows = await run(`
    SELECT s.name AS leverandoer, sp.supplier_sku, left(sp.supplier_name, 70) AS navn, sp.manufacturer, sp.category, sp.sub_category,
           sp.cost_price::float AS kost, sp.list_price::float AS liste, sp.is_available, sp.last_synced_at::date::text AS synk
      FROM supplier_products sp LEFT JOIN suppliers s ON s.id = sp.supplier_id
     WHERE ${where}
     ORDER BY sp.cost_price DESC NULLS LAST
     LIMIT 40`)
  for (const r of rows) console.log(`${r.is_available ? ' ' : 'x'} ${String(r.leverandoer).padEnd(14)} ${String(r.supplier_sku).padEnd(12)} ${String(r.navn).padEnd(70)} kost=${r.kost} liste=${r.liste} [${r.category ?? '-'}/${r.sub_category ?? '-'}] ${r.manufacturer ?? ''} synk=${r.synk}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
