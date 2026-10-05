/**
 * PRODUCTION read-only (R0): før/efter for sager hvis kontraktsum er tilbuddets beløb INKL. moms.
 * KUN SELECT — ingen UPDATE (kræver særskilt godkendelse). Viser sagsnr. og beløb (ingen personoplysninger).
 *   npx tsx scripts/prod-r0-contract-sum-preview.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-r0-preview', async (run) => {
  const rows = await run(`SELECT s.case_number, o.offer_number, s.contract_sum::float AS nu_kontraktsum,
      o.final_amount::float AS tilbud_inkl_moms, coalesce(o.tax_amount, 0)::float AS tilbud_moms,
      round(o.final_amount - coalesce(o.tax_amount, 0), 2)::float AS efter_kontraktsum,
      s.revised_sum::float AS revideret, (coalesce(o.tax_amount, 0) > 0) AS rettes,
      (SELECT count(*)::int FROM invoices i WHERE i.case_id = s.id) AS fakturaer_paa_sagen
    FROM service_cases s JOIN offers o ON o.converted_case_id = s.id
    WHERE s.contract_sum = o.final_amount ORDER BY s.case_number`)
  console.log('sag | tilbud | nu (kontraktsum) | tilbud inkl. moms | moms | efter (ekskl. moms) | revideret | rettes | fakturaer')
  for (const r of rows) console.log([r.case_number, r.offer_number, r.nu_kontraktsum, r.tilbud_inkl_moms, r.tilbud_moms, r.efter_kontraktsum, r.revideret ?? '—', r.rettes ? 'ja' : 'nej (0 moms)', r.fakturaer_paa_sagen].join(' | '))
  console.log(`${rows.length} sager; ${rows.filter((r) => r.rettes).length} ville blive rettet`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
