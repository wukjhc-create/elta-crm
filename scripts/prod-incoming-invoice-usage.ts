/**
 * PRODUCTION read-only: brug af leverandørfaktura-flowet — antal pr. status/valuta/kilde, e-conomic-opsætning.
 * Kun antal.   npx tsx scripts/prod-incoming-invoice-usage.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-incoming-invoice-usage', async (run, masked) => {
  const byStatus = await run(`SELECT status, source, currency, count(*)::int n,
      count(*) FILTER (WHERE amount_excl_vat IS NOT NULL)::int with_amount,
      count(*) FILTER (WHERE matched_case_id IS NOT NULL)::int matched_case
    FROM incoming_invoices GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`)
  const ec = await run(`SELECT coalesce(bool_or(active), false) active, count(*)::int rows FROM accounting_integration_settings WHERE provider = 'economic'`)
  const conv = await run(`SELECT (SELECT count(*) FROM case_materials WHERE source = 'supplier_invoice')::int materials,
      (SELECT count(*) FROM case_other_costs WHERE source = 'supplier_invoice')::int other_costs`)
  console.log(`--- leverandørfakturaer @ prod:${masked} ---`)
  for (const r of byStatus) console.log(JSON.stringify(r))
  console.log('e-conomic:', JSON.stringify(ec[0]), '· konverterede linjer:', JSON.stringify(conv[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
