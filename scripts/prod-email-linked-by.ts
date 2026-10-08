/** PRODUCTION read-only: hvem kobler mails (linked_by) — i alt og seneste 30 dage. Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-email-linked-by', async (run) => {
  const rows = await run(`SELECT coalesce(linked_by, '(null)') AS af, count(*)::int AS i_alt,
      count(*) FILTER (WHERE received_at > now() - interval '30 days')::int AS seneste_30d
    FROM incoming_emails WHERE link_status = 'linked' GROUP BY 1 ORDER BY 2 DESC`)
  for (const r of rows) console.log(`${String(r.af).padEnd(22)} i alt=${r.i_alt} seneste 30 d=${r.seneste_30d}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
