/**
 * PRODUCTION read-only: leverandørfaktura-pipelinen — status/parse-status, leverandør-/sagskobling, forfald. Kun antal.
 *   npx tsx scripts/prod-incoming-invoice-pipeline.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-incoming-invoice-pipeline', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'status', (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM incoming_invoices GROUP BY 1) x),
    'parse_status', (SELECT json_object_agg(parse_status, n) FROM (SELECT parse_status, count(*)::int n FROM incoming_invoices GROUP BY 1) x),
    'uden_leverandoer', (SELECT count(*)::int FROM incoming_invoices WHERE supplier_id IS NULL),
    'uden_sag', (SELECT count(*)::int FROM incoming_invoices WHERE matched_case_id IS NULL AND matched_work_order_id IS NULL),
    'uden_beloeb', (SELECT count(*)::int FROM incoming_invoices WHERE amount_incl_vat IS NULL),
    'med_linjer', (SELECT count(DISTINCT incoming_invoice_id)::int FROM incoming_invoice_lines),
    'aabne_forfaldne', (SELECT count(*)::int FROM incoming_invoices WHERE status NOT IN ('posted', 'rejected', 'paid') AND due_date < current_date),
    'manuel_review', (SELECT count(*)::int FROM incoming_invoices WHERE requires_manual_review),
    'dubletter', (SELECT count(*)::int FROM incoming_invoices WHERE duplicate_of_id IS NOT NULL),
    'nyeste', (SELECT max(created_at)::date FROM incoming_invoices)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
