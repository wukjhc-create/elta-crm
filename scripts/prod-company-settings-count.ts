/** PRODUCTION read-only: findes firmaindstillinger (singleton)? Kun antal + om centrale felter er udfyldt — aldrig værdier. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-company-settings-count', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'raekker', (SELECT count(*)::int FROM company_settings),
    'har_navn', (SELECT count(*)::int FROM company_settings WHERE coalesce(company_name, '') <> ''),
    'har_cvr', (SELECT count(*)::int FROM company_settings WHERE coalesce(company_vat_number, '') <> ''),
    'har_bank', (SELECT count(*)::int FROM company_settings WHERE coalesce(bank_account, '') <> '')
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
