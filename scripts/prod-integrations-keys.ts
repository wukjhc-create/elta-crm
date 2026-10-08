/** PRODUCTION read-only (Q10): integrationer uden api_key (webhook var åben for dem). Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-integrations-keys', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'integrationer', (SELECT count(*)::int FROM integrations),
    'aktive', (SELECT count(*)::int FROM integrations WHERE is_active),
    'aktive_uden_noegle', (SELECT count(*)::int FROM integrations WHERE is_active AND coalesce(api_key, '') = ''),
    'webhook_kald_30d', (SELECT count(*)::int FROM integration_logs WHERE created_at > now() - interval '30 days')
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
