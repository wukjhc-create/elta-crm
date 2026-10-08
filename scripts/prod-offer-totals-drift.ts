/**
 * PRODUCTION read-only: tilbuds-review #1/#6 (2026-10-07) — tilbud hvis gemte totaler afviger fra triggerens formel
 * (linjesum → rabat-% → moms-%), fx efter ændret rabat/moms uden linjeændring eller auto-tilbuddets gamle beregning.
 * Kun antal pr. status — ingen tilbud/beløb ud.
 *   npx tsx scripts/prod-offer-totals-drift.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-offer-totals-drift', async (run, masked) => {
  const rows = await run(`SELECT o.status::text status, count(*)::int offers,
      count(*) FILTER (WHERE abs(coalesce(o.final_amount, 0) - round((t.lines - round(t.lines * coalesce(o.discount_percentage, 0) / 100, 2))
        * (1 + coalesce(o.tax_percentage, 25) / 100), 2)) > 1)::int final_drift,
      count(*) FILTER (WHERE abs(coalesce(o.total_amount, 0) - t.lines) > 1)::int subtotal_drift
    FROM offers o JOIN (SELECT offer_id, coalesce(sum(total), 0) lines FROM offer_line_items GROUP BY offer_id) t ON t.offer_id = o.id
    GROUP BY 1 ORDER BY 1`)
  console.log(`--- tilbudstotaler mod triggerens formel @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
