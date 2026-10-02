/** PRODUCTION read-only: "Opsætning før pilot" (G13) på prod — kun ja/nej + antal. Bank i env kan ikke læses herfra. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-pilot-setup', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'firma_navn', (SELECT count(*)::int FROM company_settings WHERE coalesce(company_name, '') <> ''),
    'firma_cvr', (SELECT count(*)::int FROM company_settings WHERE coalesce(company_vat_number, '') <> ''),
    'bank_i_firmaindstillinger', (SELECT count(*)::int FROM company_settings WHERE coalesce(bank_reg_no, '') <> '' AND coalesce(bank_account, '') <> ''),
    'montoer_logins', (SELECT count(*)::int FROM profiles WHERE role = 'montør'),
    'montoer_logins_ukoblet', (SELECT count(*)::int FROM profiles p WHERE p.role = 'montør' AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = p.id)),
    'fakturerede_kunder_uden_economic', (SELECT count(DISTINCT i.customer_id)::int FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.status IN ('sent', 'paid') AND i.external_invoice_id IS NULL AND (c.external_provider IS DISTINCT FROM 'economic' OR c.external_customer_id IS NULL))
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
