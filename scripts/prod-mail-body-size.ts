/**
 * PRODUCTION read-only: størrelse på mailtekster (body_html/body_text) — afgør om mail-listen (select *) sender for
 * meget data pr. side. Kun tal.
 *   npx tsx scripts/prod-mail-body-size.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-mail-body-size', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'mails', count(*)::int,
    'html_gns_kb', round(avg(coalesce(length(body_html), 0)) / 1024.0, 1),
    'html_p95_kb', round((percentile_cont(0.95) WITHIN GROUP (ORDER BY coalesce(length(body_html), 0)) / 1024.0)::numeric, 1),
    'html_max_kb', round(max(coalesce(length(body_html), 0)) / 1024.0, 1),
    'text_gns_kb', round(avg(coalesce(length(body_text), 0)) / 1024.0, 1),
    'nyeste_25_html_kb', (SELECT round(sum(coalesce(length(body_html), 0) + coalesce(length(body_text), 0)) / 1024.0, 1) FROM (
        SELECT body_html, body_text FROM incoming_emails WHERE NOT is_archived AND link_status <> 'ignored' ORDER BY received_at DESC LIMIT 25) x)
  ) r FROM incoming_emails`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
