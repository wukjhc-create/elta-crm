/**
 * PRODUCTION read-only: Graph-mailsynk pr. postkasse (kun lokal del af adressen) — seneste synk, status, fejl (afkortet),
 * og seneste indgående/udgående mail pr. postkasse. Afgør om "Kræver svar" kan se svar sendt fra Outlook.
 *   npx tsx scripts/prod-mail-sync-state.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-mail-sync-state', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'synk', (SELECT json_agg(json_build_object('postkasse', split_part(mailbox, '@', 1), 'seneste', last_sync_at, 'status', last_sync_status,
        'fejl', left(coalesce(last_sync_error, ''), 80)) ORDER BY mailbox) FROM graph_sync_state),
    'udgaaende_pr_afsender', (SELECT json_agg(json_build_object('afsender', a, 'n', n, 'seneste', s)) FROM (
        SELECT split_part(lower(sender_email), '@', 1) a, count(*)::int n, max(received_at)::date s FROM incoming_emails
        WHERE sender_email ILIKE '%@eltasolar.dk' GROUP BY 1 ORDER BY 2 DESC) x),
    'indgaaende_pr_postkasse_30d', (SELECT json_agg(json_build_object('postkasse', p, 'n', n)) FROM (
        SELECT split_part(lower(to_email), '@', 1) p, count(*)::int n FROM incoming_emails
        WHERE received_at > now() - interval '30 days' AND sender_email NOT ILIKE '%@eltasolar.dk' GROUP BY 1 ORDER BY 2 DESC) x)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
