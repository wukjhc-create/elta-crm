/**
 * PRODUCTION read-only (PM-1/PM-2, portal-review 2026-10-17): hvor ofte går kundemails til en anden part end
 * tilbuds-/sagskunden? Fordeling af offers.billing_mode og sager med site_customer/kontakt ≠ kunde. Kun antal.
 *   npx tsx scripts/prod-billing-mode-counts.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-billing-mode-counts', async (run, masked) => {
  const offers = await run(`SELECT coalesce(billing_mode,'NULL') m, status, count(*)::int n FROM public.offers GROUP BY 1,2 ORDER BY 1,2`)
  const cases = await run(`SELECT count(*) FILTER (WHERE site_customer_id IS NOT NULL AND site_customer_id <> customer_id)::int site_diff,
      count(*) FILTER (WHERE payer_customer_id IS NOT NULL AND payer_customer_id <> customer_id)::int payer_diff, count(*)::int total
    FROM public.service_cases`).catch((e) => [{ error: maskDbError(e) }])
  console.log(`prod:${masked} tilbud=${JSON.stringify(offers)} sager=${JSON.stringify(cases)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
