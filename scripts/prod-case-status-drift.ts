/**
 * PRODUCTION read-only: sager hvis status ikke matcher arbejdet (N58) — "new" trods startede/afsluttede job eller
 * registreret tid; "in_progress" hvor alle job er udført. Kun antal.
 *   npx tsx scripts/prod-case-status-drift.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-case-status-drift', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'status', (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM service_cases GROUP BY 1) x),
    'new_med_arbejde', (SELECT count(*)::int FROM service_cases s WHERE s.status = 'new' AND (
        EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id AND w.status IN ('in_progress', 'done'))
        OR EXISTS (SELECT 1 FROM time_logs t JOIN work_orders w ON w.id = t.work_order_id WHERE w.case_id = s.id))),
    'new_med_faktura', (SELECT count(*)::int FROM service_cases s WHERE s.status = 'new' AND EXISTS (SELECT 1 FROM invoices i WHERE i.case_id = s.id AND i.status <> 'draft')),
    'aktive_alle_job_udfoert', (SELECT count(*)::int FROM service_cases s WHERE s.status IN ('new', 'in_progress')
        AND EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id AND w.status IN ('planned', 'in_progress')))
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
