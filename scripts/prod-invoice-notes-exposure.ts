/** PRODUCTION read-only: SENDTE fakturaer med "Intern note" (invoices.notes) — kom med på kundens PDF før D34. Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-invoice-notes-exposure', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'sendte_fakturaer', (SELECT count(*)::int FROM invoices WHERE status IN ('sent', 'paid')),
    'sendte_med_intern_note', (SELECT count(*)::int FROM invoices WHERE status IN ('sent', 'paid') AND coalesce(notes, '') <> '')
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
