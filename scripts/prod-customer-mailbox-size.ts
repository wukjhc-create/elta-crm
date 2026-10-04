/**
 * PRODUCTION read-only: mailtekst pr. kunde (kundens mailtidslinje henter op til 200 mails MED brødtekst). Kun tal.
 *   npx tsx scripts/prod-customer-mailbox-size.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-customer-mailbox-size', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'kunder_med_mails', count(*)::int,
    'mails_max', max(n), 'mails_p95', percentile_cont(0.95) WITHIN GROUP (ORDER BY n),
    'kb_max', round(max(b) / 1024.0, 1), 'kb_p95', round((percentile_cont(0.95) WITHIN GROUP (ORDER BY b) / 1024.0)::numeric, 1), 'kb_gns', round(avg(b) / 1024.0, 1)
  ) r FROM (SELECT customer_id, count(*)::int n, sum(coalesce(length(body_html), 0) + coalesce(length(body_text), 0))::bigint b
    FROM incoming_emails WHERE customer_id IS NOT NULL AND NOT is_archived GROUP BY customer_id) x`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
