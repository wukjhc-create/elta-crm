/**
 * PRODUCTION read-only: status for faktura-vedhaeftnings-backfill (IC11) — kun antal.
 *   npx tsx scripts/prod-backfill-status.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-backfill-status', async (run, masked) => {
  console.log(`--- backfill-status @ prod:${masked} ---`)
  console.log('  backfill-audit pr. udfald:', JSON.stringify(await run(`SELECT coalesce(new_value->>'outcome','?') udfald, ok, count(*)::int n
    FROM incoming_invoice_audit_log WHERE action = 'attachment_backfill' GROUP BY 1,2 ORDER BY 1`)))
  console.log('  opgraderet fra vedhæftning:', JSON.stringify((await run(`SELECT count(*)::int n FROM incoming_invoice_audit_log WHERE action = 'upgraded_from_attachment'`))[0]))
  console.log('  seneste faktura-cron:', JSON.stringify(await run(`SELECT status, created_at::text t FROM system_health_log WHERE service = 'cron' AND message ILIKE '%incoming-invoices%' ORDER BY created_at DESC LIMIT 2`).catch(() => [])))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
