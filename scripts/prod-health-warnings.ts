/**
 * PRODUCTION read-only: advarsler/fejl i system_health_log (7 d) — service, status, besked (afkortet), antal.
 *   npx tsx scripts/prod-health-warnings.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-health-warnings', async (run) => {
  const rows = await run(`SELECT service, status, left(regexp_replace(coalesce(message, ''), '[0-9a-f]{8}-[0-9a-f-]{27,}', '<id>', 'g'), 120) msg,
      count(*)::int n, max(created_at)::text seneste
    FROM system_health_log WHERE created_at > now() - interval '7 days' AND status <> 'ok' AND status <> 'healthy'
    GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 25`)
  for (const r of rows) console.log(`${String(r.n).padStart(4)}× ${r.service} [${r.status}] ${r.msg}  (seneste ${String(r.seneste).slice(0, 16)})`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
