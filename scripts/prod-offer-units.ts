/** PRODUCTION read-only: enheder brugt paa tilbudslinjer (antal). */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-offer-units', async (run) => { console.log(JSON.stringify(await run(`SELECT coalesce(unit,'(null)') unit, count(*)::int n FROM offer_line_items GROUP BY 1 ORDER BY 2 DESC`))) }).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
