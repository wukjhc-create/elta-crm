/** PRODUCTION read-only: brug af pakke-/auto-tilbudsstien (GP-6).  npx tsx scripts/prod-package-lines-usage.ts */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-package-lines-usage', async (run) => {
  const r = (await run(`SELECT (SELECT count(*) FROM offer_line_items WHERE notes LIKE 'Package:%')::int pakke_linjer, (SELECT count(DISTINCT offer_id) FROM offer_line_items WHERE notes LIKE 'Package:%')::int tilbud, (SELECT count(*) FROM packages)::int pakker`)) as Array<Record<string, number>>
  console.log(JSON.stringify(r[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
