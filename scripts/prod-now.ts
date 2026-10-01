/** PRODUCTION read-only: databasens nuvaerende tid (UTC) + seneste cron-koersel. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-now', async (run) => {
  console.log(JSON.stringify((await run(`SELECT now()::text nu, (SELECT max(created_at)::text FROM system_health_log WHERE service='cron') seneste_cron`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
