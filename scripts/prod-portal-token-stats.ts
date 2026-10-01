/** PRODUCTION read-only: portal-tokens pr. tilstand (kun antal) — GO-LIVE G3. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-portal-token-stats', async (run) => {
  console.log(JSON.stringify((await run(`SELECT
    count(*) FILTER (WHERE is_active AND expires_at IS NULL)::int aktiv_uden_udloeb,
    count(*) FILTER (WHERE is_active AND expires_at > now())::int aktiv_gyldig,
    count(*) FILTER (WHERE is_active AND expires_at <= now())::int aktiv_men_udloebet,
    count(*) FILTER (WHERE NOT is_active)::int inaktiv,
    (SELECT count(*)::int FROM (SELECT customer_id FROM portal_access_tokens WHERE is_active GROUP BY customer_id HAVING count(*) > 1) d) kunder_med_flere_aktive,
    (SELECT count(DISTINCT o.customer_id)::int FROM offers o WHERE o.status IN ('sent','viewed') AND NOT EXISTS (SELECT 1 FROM portal_access_tokens t WHERE t.customer_id = o.customer_id AND t.is_active AND (t.expires_at IS NULL OR t.expires_at > now()))) kunder_m_aabent_tilbud_uden_gyldigt_link
    FROM portal_access_tokens`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
