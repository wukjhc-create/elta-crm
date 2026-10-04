/**
 * PRODUCTION read-only: "Kræver svar" — koblede kundetråde hvor seneste mail er indgående (samme regel som
 * email-response-status.ts), fordelt på alder. Kun antal.
 *   npx tsx scripts/prod-requires-response.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-requires-response', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'kraever_svar', (SELECT count(*)::int FROM (
        SELECT DISTINCT ON (e.conversation_id) e.conversation_id, e.sender_email, e.customer_id, e.link_status
        FROM incoming_emails e WHERE e.conversation_id IS NOT NULL ORDER BY e.conversation_id, e.received_at DESC) t
        WHERE t.sender_email NOT ILIKE '%@eltasolar.dk' AND t.customer_id IS NOT NULL AND t.link_status NOT IN ('ignored', 'pending')),
    'alder', (SELECT json_object_agg(b, n) FROM (SELECT CASE WHEN d < 2 THEN '0-1 d' WHEN d < 7 THEN '2-6 d' WHEN d < 30 THEN '7-29 d' ELSE '30+ d' END b, count(*)::int n FROM (
        SELECT extract(day FROM now() - t.received_at)::int d FROM (
          SELECT DISTINCT ON (e.conversation_id) e.conversation_id, e.sender_email, e.customer_id, e.link_status, e.received_at
          FROM incoming_emails e WHERE e.conversation_id IS NOT NULL ORDER BY e.conversation_id, e.received_at DESC) t
        WHERE t.sender_email NOT ILIKE '%@eltasolar.dk' AND t.customer_id IS NOT NULL AND t.link_status NOT IN ('ignored', 'pending')) y GROUP BY 1) x)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
