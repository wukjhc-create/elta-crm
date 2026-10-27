/** PRODUCTION read-only: fuld kolonnedefinition (type/nullable/default + FK m. delete-adfærd + indeks).  npx tsx scripts/prod-column-detail.ts tabel kolonne */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { columnDetailQueries } from './test-harness/column-detail'
const [table, col] = process.argv.slice(2)
withProdReadOnly('prod-column-detail', async (run) => {
  const q = columnDetailQueries(table, col)
  for (const [k, sql] of Object.entries(q)) console.log(k, JSON.stringify(await run(sql)))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
