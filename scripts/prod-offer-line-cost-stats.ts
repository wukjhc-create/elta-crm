/** PRODUCTION read-only: tilbudslinjer pr. linjetype — hvor mange mangler kostpris (kun antal/summer). */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-offer-line-cost-stats', async (run) => {
  console.log(JSON.stringify(await run(`SELECT coalesce(line_type,'(null)') type, count(*)::int linjer,
    count(*) FILTER (WHERE coalesce(cost_price, supplier_cost_price_at_creation, 0) = 0)::int uden_kost,
    round(sum(total)::numeric, 0)::int salg FROM offer_line_items GROUP BY 1 ORDER BY 2 DESC`)))
  console.log(JSON.stringify(await run(`SELECT time_cost_basis, time_cost_rate FROM company_settings LIMIT 1`)))
  console.log(JSON.stringify(await run(`SELECT setting_key, setting_value FROM calculation_settings WHERE setting_key ~* '(db|overhead|margin|hourly)' ORDER BY 1`).catch(() => [])))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
