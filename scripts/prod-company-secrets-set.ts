/** PRODUCTION read-only (Q10): er company_settings' hemmelige felter udfyldt (kun ja/nej) + antal aktive portallinks. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-company-secrets-set', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'smtp_password_sat', (SELECT bool_or(coalesce(smtp_password, '') <> '') FROM company_settings),
    'sms_api_key_sat', (SELECT bool_or(coalesce(sms_gateway_api_key, '') <> '') FROM company_settings),
    'sms_secret_sat', (SELECT bool_or(coalesce(sms_gateway_secret, '') <> '') FROM company_settings),
    'aktive_portallinks', (SELECT count(*)::int FROM portal_access_tokens WHERE is_active AND (expires_at IS NULL OR expires_at > now()))
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
