/**
 * PRODUCTION read-only (Henrik 2026-10-15): grundlag for eksplicit billing model (fixed_price / time_and_materials).
 * Klassificerer eksisterende sager UDEN at ændre noget — kun tal:
 *   sikker T&M        : ingen kontraktsum og intet revideret beløb
 *   sikker fast pris   : har forskud/rate faktureret som % af kontraktsum, eller revideret beløb sat
 *   tvetydig           : kontraktsum (typisk fra tilbud) men intet der viser hvordan sagen faktureres
 *   npx tsx scripts/prod-billing-model-scan.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-billing-model-scan', async (run, masked) => {
  const rows = (await run(`
    SELECT
      CASE
        WHEN contract_sum IS NULL AND revised_sum IS NULL THEN 'sikker_tm (ingen kontraktsum)'
        WHEN revised_sum IS NOT NULL THEN 'sikker_fast (revideret beløb)'
        WHEN has_stage THEN 'sikker_fast (forskud/rate af kontraktsum)'
        WHEN has_line_invoice THEN 'tvetydig (kontraktsum men del-faktura på linjer)'
        ELSE 'tvetydig (kontraktsum, ingen fakturering endnu)'
      END AS klasse,
      count(*)::int n,
      count(*) FILTER (WHERE source_offer_id IS NOT NULL)::int fra_tilbud,
      count(*) FILTER (WHERE status = 'closed')::int lukkede,
      count(*) FILTER (WHERE has_time)::int med_timer,
      count(*) FILTER (WHERE has_final)::int med_slutfaktura
    FROM (
      SELECT sc.id, sc.status, sc.contract_sum, sc.revised_sum, sc.source_offer_id,
        EXISTS (SELECT 1 FROM invoices i WHERE i.case_id = sc.id AND i.invoice_type IN ('deposit','progress') AND i.amount_basis IN ('contract_sum','revised_sum')) AS has_stage,
        EXISTS (SELECT 1 FROM invoices i WHERE i.case_id = sc.id AND i.invoice_type = 'standard') AS has_line_invoice,
        EXISTS (SELECT 1 FROM invoices i WHERE i.case_id = sc.id AND i.invoice_type = 'final') AS has_final,
        EXISTS (SELECT 1 FROM work_orders w JOIN time_logs t ON t.work_order_id = w.id WHERE w.case_id = sc.id) AS has_time
      FROM service_cases sc WHERE coalesce(sc.is_proposal, false) = false AND sc.status <> 'converted'
    ) c GROUP BY 1 ORDER BY 1`)) as Array<Record<string, unknown>>
  console.log(`prod:${masked} sager efter klassifikation:`)
  for (const r of rows) console.log(`  ${String(r.klasse).padEnd(52)} n=${r.n} fra_tilbud=${r.fra_tilbud} lukkede=${r.lukkede} med_timer=${r.med_timer} med_slutfaktura=${r.med_slutfaktura}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
