/** PRODUCTION read-only: e-conomic-opsætning (KUN aktiv/nøgle-findes/config-NØGLER — aldrig værdier) + leverandørkobling. GO-LIVE G7. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-economic-status', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'settings', (SELECT json_agg(json_build_object('provider', provider, 'active', active, 'har_api_token', api_token IS NOT NULL,
       'har_grant', agreement_grant_token IS NOT NULL, 'config_noegler', (SELECT json_agg(k) FROM jsonb_object_keys(COALESCE(config, '{}'::jsonb)) k)))
       FROM accounting_integration_settings),
    'leverandoerer', (SELECT count(*)::int FROM suppliers),
    'leverandoerer_med_economic_nr', (SELECT count(*)::int FROM suppliers WHERE external_supplier_id IS NOT NULL AND external_provider = 'economic'),
    'kundefakturaer_bogfoert', (SELECT count(*)::int FROM invoices WHERE external_provider = 'economic'),
    'leverandoerfakturaer_godkendt', (SELECT count(*)::int FROM incoming_invoices WHERE status = 'approved'),
    'leverandoerfakturaer_bogfoert', (SELECT count(*)::int FROM incoming_invoices WHERE external_provider = 'economic')
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
