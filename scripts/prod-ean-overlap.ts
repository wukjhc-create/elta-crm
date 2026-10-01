/** PRODUCTION read-only: EAN der findes hos flere leverandoerer + prisforskelle (kun aggregater). */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-ean-overlap', async (run) => {
  console.log(JSON.stringify((await run(`SELECT count(*)::int ean_flere_lev, count(*) FILTER (WHERE mx > mn * 1.05)::int over_5pct_forskel,
      round(avg((mx - mn) / NULLIF(mx,0) * 100)::numeric, 1)::float gns_spaend_pct, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY (mx-mn)/NULLIF(mx,0)*100))::numeric,1)::float median_pct
    FROM (SELECT ean, min(cost_price) mn, max(cost_price) mx FROM supplier_products
      WHERE ean IS NOT NULL AND ean <> '' AND cost_price > 0 GROUP BY ean HAVING count(DISTINCT supplier_id) > 1) g`))[0]))
  console.log(JSON.stringify((await run(`SELECT count(*)::int linjer_med_leverandoer FROM offer_line_items WHERE supplier_product_id IS NOT NULL`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
