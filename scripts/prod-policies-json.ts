/** PRODUCTION read-only: politikker for kommaseparerede tabeller.  npx tsx scripts/prod-policies-json.ts t1,t2 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { tablePoliciesQuery } from './test-harness/column-detail'
withProdReadOnly('prod-policies-json', async (run) => {
  for (const r of await run(tablePoliciesQuery(process.argv[2] ?? ''))) console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
