/** PRODUCTION read-only (rapport-review): sager med contract_sum fra tilbud (inkl. moms) og rate-fakturaer på kontraktsum. Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-contract-sum', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'sager_med_kontraktsum', (SELECT count(*)::int FROM service_cases WHERE contract_sum IS NOT NULL),
    'heraf_lig_tilbud_inkl_moms', (SELECT count(*)::int FROM service_cases s JOIN offers o ON o.converted_case_id = s.id WHERE s.contract_sum = o.final_amount),
    'heraf_lig_tilbud_ekskl_moms', (SELECT count(*)::int FROM service_cases s JOIN offers o ON o.converted_case_id = s.id WHERE s.contract_sum = o.final_amount - o.tax_amount),
    'rate_fakturaer_paa_kontraktsum', (SELECT count(*)::int FROM invoices WHERE invoice_type IN ('deposit','progress') AND amount_basis = 'contract_sum'),
    'heraf_ikke_kladde', (SELECT count(*)::int FROM invoices WHERE invoice_type IN ('deposit','progress') AND amount_basis = 'contract_sum' AND status <> 'draft')
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
