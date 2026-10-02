/** PRODUCTION read-only: er tilbudsstandarder sat (gyldighedsdage, betingelser, moms)? Kun ja/nej + antal dage. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-offer-defaults', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'gyldighedsdage', (SELECT default_offer_validity_days FROM company_settings LIMIT 1),
    'har_standardbetingelser', (SELECT count(*)::int FROM company_settings WHERE coalesce(default_terms_and_conditions, '') <> ''),
    'momssats', (SELECT default_tax_percentage FROM company_settings LIMIT 1)
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
