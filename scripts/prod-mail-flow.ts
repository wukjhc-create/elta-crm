/**
 * PRODUCTION read-only: mailflow seneste 30 dage (N59) — koblingsstatus, kræver svar, arkiveret/ignoreret, alder på
 * ubehandlede. Kun aggregater.
 *   npx tsx scripts/prod-mail-flow.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-mail-flow', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'mails_30d', (SELECT count(*)::int FROM incoming_emails WHERE received_at > now() - interval '30 days'),
    'link_status', (SELECT json_object_agg(coalesce(link_status::text, 'null'), n) FROM (SELECT link_status, count(*)::int n FROM incoming_emails WHERE received_at > now() - interval '30 days' GROUP BY 1) x),
    'arkiveret', (SELECT count(*)::int FROM incoming_emails WHERE received_at > now() - interval '30 days' AND is_archived = true),
    'ulaest', (SELECT count(*)::int FROM incoming_emails WHERE received_at > now() - interval '30 days' AND coalesce(is_read, false) = false AND coalesce(is_archived, false) = false),
    'aeldste_ulaeste_dage', (SELECT floor(extract(epoch FROM now() - min(received_at)) / 86400)::int FROM incoming_emails WHERE coalesce(is_read, false) = false AND coalesce(is_archived, false) = false AND received_at > now() - interval '90 days')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
