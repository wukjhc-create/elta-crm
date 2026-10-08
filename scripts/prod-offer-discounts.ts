/** PRODUCTION read-only (faktura-review): hvor mange tilbud har rabat (tilbud/linje)? Kun antal.  npx tsx scripts/prod-offer-discounts.ts */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-offer-discounts', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'tilbud', (SELECT count(*)::int FROM offers),
    'tilbud_med_rabat', (SELECT count(*)::int FROM offers WHERE coalesce(discount_percentage, 0) > 0 OR coalesce(discount_amount, 0) > 0),
    'linjer_med_rabat', (SELECT count(*)::int FROM offer_line_items WHERE coalesce(discount_percentage, 0) > 0),
    'fakturaer_fra_tilbud', (SELECT count(*)::int FROM invoices WHERE offer_id IS NOT NULL)
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
