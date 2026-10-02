/** PRODUCTION read-only: sager med "Bemærkninger (interne)" (status_note) hvor kunden har aktiv portaladgang — kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-status-note-exposure', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'sager_med_note', (SELECT count(*)::int FROM service_cases WHERE coalesce(status_note, '') <> ''),
    'heraf_kunde_med_aktiv_portal', (SELECT count(*)::int FROM service_cases sc WHERE coalesce(sc.status_note, '') <> ''
       AND EXISTS (SELECT 1 FROM portal_access_tokens t WHERE t.customer_id = sc.customer_id AND t.is_active AND (t.expires_at IS NULL OR t.expires_at > now()))),
    'kunder_beroert', (SELECT count(DISTINCT sc.customer_id)::int FROM service_cases sc WHERE coalesce(sc.status_note, '') <> ''
       AND EXISTS (SELECT 1 FROM portal_access_tokens t WHERE t.customer_id = sc.customer_id AND t.is_active AND (t.expires_at IS NULL OR t.expires_at > now())))
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
