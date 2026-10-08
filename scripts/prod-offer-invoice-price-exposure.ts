/**
 * PRODUCTION read-only: tilbuds-review #3 (2026-10-07) — create_invoice_from_offer prissætter med
 * COALESCE(sale_price, unit_price, 0), men manuelle linjer gemmer kun unit_price (sale_price DEFAULT 0).
 * Er auto-faktura-reglen aktiv, og findes der linjer/fakturaer ramt af det? Kun antal og beløbssummer.
 *   npx tsx scripts/prod-offer-invoice-price-exposure.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-offer-invoice-price-exposure', async (run, masked) => {
  const rules = await run(`SELECT name, trigger, action, active FROM automation_rules WHERE action = 'create_invoice_from_offer' OR trigger = 'offer_accepted'`)
  console.log(`--- auto-faktura-regler @ prod:${masked} ---`)
  console.table(rules)
  const lines = await run(`SELECT
      count(*)::int lines,
      count(*) FILTER (WHERE coalesce(li.sale_price, 0) = 0 AND coalesce(li.unit_price, 0) <> 0)::int sale0_unit_nonzero,
      count(*) FILTER (WHERE coalesce(li.sale_price, 0) <> 0 AND li.unit_price IS NOT NULL AND li.sale_price <> li.unit_price)::int sale_differs_from_unit,
      count(DISTINCT li.offer_id) FILTER (WHERE coalesce(li.sale_price, 0) = 0 AND coalesce(li.unit_price, 0) <> 0)::int offers_affected,
      count(DISTINCT li.offer_id) FILTER (WHERE coalesce(li.sale_price, 0) = 0 AND coalesce(li.unit_price, 0) <> 0 AND o.status IN ('draft','sent','viewed'))::int open_offers_affected
    FROM offer_line_items li JOIN offers o ON o.id = li.offer_id`)
  console.log('--- tilbudslinjer ---')
  console.table(lines)
  const invs = await run(`SELECT count(*)::int invoices_from_offers,
      count(*) FILTER (WHERE abs(coalesce(i.total_amount, 0) - coalesce(o.total_amount, 0) + coalesce(o.discount_amount, 0)) > 1)::int net_differs_from_offer
    FROM invoices i JOIN offers o ON o.id = i.offer_id`)
  console.log('--- fakturaer oprettet fra tilbud ---')
  console.table(invs)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
