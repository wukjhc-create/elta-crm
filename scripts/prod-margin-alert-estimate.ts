/**
 * PRODUCTION read-only: hvor mange aktive tilbud (kladde/sendt) falder under margin-grænsen med kost × antal vs. den
 * gamle beregning (enhedskost). Kun antal — ingen tilbud/beløb ud.
 *   npx tsx scripts/prod-margin-alert-estimate.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-margin-alert-estimate', async (run, masked) => {
  const rows = await run(`SELECT
      count(*) FILTER (WHERE cost_new > 0 AND sale > 0)::int with_cost,
      count(*) FILTER (WHERE cost_old > 0 AND sale > 0 AND (sale - cost_old) / sale * 100 < 15)::int under15_old,
      count(*) FILTER (WHERE cost_new > 0 AND sale > 0 AND (sale - cost_new) / sale * 100 < 15)::int under15_new,
      count(*) FILTER (WHERE cost_new > 0 AND sale > 0 AND (sale - cost_new) / sale * 100 < 15 AND has_alert)::int under15_new_already_alerted
    FROM (SELECT o.id,
        sum(coalesce(li.cost_price, 0)) cost_old,
        sum(coalesce(li.cost_price, 0) * coalesce(li.quantity, 0)) cost_new,
        sum(coalesce(li.total, 0)) sale,
        bool_or(EXISTS (SELECT 1 FROM system_alerts a WHERE a.entity_type = 'offer' AND a.entity_id = o.id AND a.alert_type = 'margin_below' AND NOT a.is_dismissed)) has_alert
      FROM offers o JOIN offer_line_items li ON li.offer_id = o.id
      WHERE o.status IN ('draft', 'sent') GROUP BY o.id) t`)
  console.log(`--- margin-advarsel estimat @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
