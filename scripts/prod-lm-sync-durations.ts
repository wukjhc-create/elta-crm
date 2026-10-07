/** PRODUCTION read-only: varighed af de seneste LM FTP-synk (supplier_sync_logs) — kun tal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-lm-sync-durations', async (run) => {
  const rows = await run(`SELECT l.created_at::date::text d, l.status, l.duration_ms, l.total_items, l.new_items, l.updated_items FROM supplier_sync_logs l JOIN suppliers s ON s.id = l.supplier_id WHERE s.name ILIKE '%lemvigh%' ORDER BY l.created_at DESC LIMIT 6`)
  for (const r of rows) console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
