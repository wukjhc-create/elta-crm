/**
 * PRODUCTION read-only: cron-status pr. cron siden et tidspunkt (fx efter en migration). Kun status/antal.
 *   npx tsx scripts/prod-cron-status-since.ts "2026-09-30 09:00"
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const since = (process.argv[2] || '').replace(/[^0-9 :T-]/g, '') || '2026-09-30 00:00'
withProdReadOnly('prod-cron-status-since', async (run, masked) => {
  console.log(`--- cron-status siden ${since} @ prod:${masked} ---`)
  const rows = (await run(`SELECT coalesce(metadata->>'cron', substring(message from 'cron[: ]+([a-z-]+)')) cron, status, count(*)::int n, max(created_at)::text seneste
    FROM system_health_log WHERE service = 'cron' AND created_at > '${since}'::timestamptz GROUP BY 1,2 ORDER BY 1,2`)) as any[]
  for (const r of rows) console.log(`  ${String(r.cron).padEnd(28)} ${String(r.status).padEnd(8)} ${r.n}  (seneste ${r.seneste.slice(0, 16)})`)
  console.log('  00168 kørt:', JSON.stringify(await run(`SELECT max(created_at)::text t FROM system_health_log WHERE message ILIKE '%00168%'`).catch(() => [])))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
