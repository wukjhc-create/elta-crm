/**
 * PRODUCTION read-only: overståede arbejdsordrer uden registreret tid (N62) og forfaldne fakturaer (N61). Kun antal.
 *   npx tsx scripts/prod-jobs-without-time.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-jobs-without-time', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'work_orders', (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM work_orders GROUP BY 1) x),
    'overstaaede_med_montoer_60d', (SELECT count(*)::int FROM work_orders w WHERE w.status <> 'cancelled' AND w.assigned_employee_id IS NOT NULL
        AND w.scheduled_date < (now() AT TIME ZONE 'Europe/Copenhagen')::date AND w.scheduled_date >= (now() AT TIME ZONE 'Europe/Copenhagen')::date - 60),
    'uden_tid_60d', (SELECT count(*)::int FROM work_orders w WHERE w.status <> 'cancelled' AND w.assigned_employee_id IS NOT NULL
        AND w.scheduled_date < (now() AT TIME ZONE 'Europe/Copenhagen')::date AND w.scheduled_date >= (now() AT TIME ZONE 'Europe/Copenhagen')::date - 60
        AND NOT EXISTS (SELECT 1 FROM time_logs t WHERE t.work_order_id = w.id)),
    'done_uden_tid_alle', (SELECT count(*)::int FROM work_orders w WHERE w.status = 'done' AND NOT EXISTS (SELECT 1 FROM time_logs t WHERE t.work_order_id = w.id)),
    'forfaldne_fakturaer', (SELECT count(*)::int FROM invoices i WHERE i.status = 'sent' AND i.voided_at IS NULL AND coalesce(i.invoice_type, '') <> 'credit'
        AND i.due_date < (now() AT TIME ZONE 'Europe/Copenhagen')::date),
    'forfaldne_uden_rykker', (SELECT count(*)::int FROM invoices i WHERE i.status = 'sent' AND i.voided_at IS NULL AND coalesce(i.invoice_type, '') <> 'credit'
        AND i.due_date < (now() AT TIME ZONE 'Europe/Copenhagen')::date AND coalesce(i.reminder_count, 0) = 0)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
