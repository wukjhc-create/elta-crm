/** PRODUCTION read-only (D24): omfang af tilbud åbnet i kundeportalen hvor linjerne havde kostpris/noter (sendt til kundens browser før fix). Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-portal-cost-exposure', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'tilbud_aabnet_i_portal', (SELECT count(*)::int FROM offers WHERE viewed_at IS NOT NULL),
    'heraf_med_kostpris_paa_linjer', (SELECT count(DISTINCT o.id)::int FROM offers o JOIN offer_line_items l ON l.offer_id = o.id
       WHERE o.viewed_at IS NOT NULL AND (coalesce(l.cost_price, 0) > 0 OR l.supplier_cost_price_at_creation IS NOT NULL)),
    'heraf_med_interne_linjenoter', (SELECT count(DISTINCT o.id)::int FROM offers o JOIN offer_line_items l ON l.offer_id = o.id
       WHERE o.viewed_at IS NOT NULL AND coalesce(l.notes, '') <> ''),
    'kunder_beroert', (SELECT count(DISTINCT o.customer_id)::int FROM offers o JOIN offer_line_items l ON l.offer_id = o.id
       WHERE o.viewed_at IS NOT NULL AND (coalesce(l.cost_price, 0) > 0 OR coalesce(l.notes, '') <> ''))
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
