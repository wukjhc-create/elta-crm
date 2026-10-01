/** PRODUCTION read-only: fakturalinjer hvor antal × enhedspris ≠ linjetotal (e-conomic ville bogføre et andet beløb). Kun tællinger — ingen kundedata. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-invoice-line-math', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'linjer', (SELECT count(*)::int FROM invoice_lines),
    'linjer_afvig', (SELECT count(*)::int FROM invoice_lines WHERE abs(round(quantity * unit_price, 2) - total_price) >= 0.005),
    'fakturaer_med_afvig', (SELECT count(DISTINCT invoice_id)::int FROM invoice_lines WHERE abs(round(quantity * unit_price, 2) - total_price) >= 0.005),
    'fakturaer_sum_afvig', (SELECT count(*)::int FROM invoices i WHERE abs(COALESCE((SELECT sum(round(l.quantity * l.unit_price, 2)) FROM invoice_lines l WHERE l.invoice_id = i.id), 0) - i.total_amount) >= 0.005
                              AND EXISTS (SELECT 1 FROM invoice_lines l WHERE l.invoice_id = i.id)),
    'fakturaer', (SELECT count(*)::int FROM invoices),
    'max_afvig_kr', (SELECT max(abs(round(quantity * unit_price, 2) - total_price)) FROM invoice_lines)
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
