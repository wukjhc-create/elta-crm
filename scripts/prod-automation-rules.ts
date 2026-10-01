/** PRODUCTION read-only: automation_rules (trigger, aktiv, handling) + seneste kørsler. Ingen rækkedata ud over regelopsætning. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-automation-rules', async (run) => {
  const rows = await run(`SELECT json_agg(r) j FROM (SELECT * FROM automation_rules ORDER BY trigger) r`)
  const rules = (rows[0].j ?? []) as Array<Record<string, unknown>>
  for (const r of rules) {
    const { id, created_at, updated_at, ...rest } = r
    console.log(JSON.stringify(rest))
  }
  console.log(JSON.stringify((await run(`SELECT count(*)::int n, max(created_at)::text seneste FROM automation_executions`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
