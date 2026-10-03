/**
 * PRODUCTION read-only: D40 — eksponerede kundeportalen interne kundeopgaver? getPortalBesigtigelser faldt tilbage
 * til ALLE kundens opgaver (titel + beskrivelse), når kunden ingen besigtigelsesopgave havde. Kun antal.
 *   npx tsx scripts/prod-portal-tasks-exposure.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-portal-tasks-exposure', async (run) => {
  const r = (await run(`SELECT json_build_object(
    'portal_kunder', (SELECT count(DISTINCT customer_id) FROM portal_access_tokens WHERE is_active),
    'kunder_med_opgaver', (SELECT count(DISTINCT t.customer_id) FROM customer_tasks t
       WHERE t.customer_id IN (SELECT customer_id FROM portal_access_tokens WHERE is_active)),
    'kunder_hvor_interne_opgaver_vises', (SELECT count(*) FROM (SELECT t.customer_id FROM customer_tasks t
       WHERE t.customer_id IN (SELECT customer_id FROM portal_access_tokens WHERE is_active)
       GROUP BY t.customer_id HAVING count(*) FILTER (WHERE t.title ILIKE '%esigtigelse%' OR coalesce(t.description,'') ILIKE '%esigtigelse%') = 0) x),
    'interne_opgaver_paa_disse', (SELECT count(*) FROM customer_tasks t WHERE t.customer_id IN (
       SELECT t2.customer_id FROM customer_tasks t2 WHERE t2.customer_id IN (SELECT customer_id FROM portal_access_tokens WHERE is_active)
       GROUP BY t2.customer_id HAVING count(*) FILTER (WHERE t2.title ILIKE '%esigtigelse%' OR coalesce(t2.description,'') ILIKE '%esigtigelse%') = 0))
  ) j`))[0].j
  console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
