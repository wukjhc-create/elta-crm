/** PRODUCTION read-only: er SMTP konfigureret i firmaindstillinger? Kun ja/nej — aldrig værdier. (Env kan ikke læses herfra.) */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-smtp-source', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'db_smtp_host', (SELECT count(*)::int FROM company_settings WHERE coalesce(smtp_host, '') <> ''),
    'db_smtp_user', (SELECT count(*)::int FROM company_settings WHERE coalesce(smtp_user, '') <> ''),
    'db_smtp_password', (SELECT count(*)::int FROM company_settings WHERE coalesce(smtp_password, '') <> '')
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
