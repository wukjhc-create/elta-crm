/** PRODUCTION read-only: tilbud SENDT til kunder hvor "Interne noter" (offers.notes) eller linjenoter er udfyldt (kom med på kundens PDF). Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-offer-notes-exposure', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'sendte_tilbud', (SELECT count(*)::int FROM offers WHERE sent_at IS NOT NULL),
    'sendte_med_interne_noter', (SELECT count(*)::int FROM offers WHERE sent_at IS NOT NULL AND coalesce(notes, '') <> ''
       AND notes !~* '^Afvist (via portal|med begrundelse):'),
    'sendte_med_linjenoter', (SELECT count(DISTINCT o.id)::int FROM offers o JOIN offer_line_items l ON l.offer_id = o.id WHERE o.sent_at IS NOT NULL AND coalesce(l.notes, '') <> '')
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
