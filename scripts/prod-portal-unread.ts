/**
 * PRODUCTION read-only: ulæste kundebeskeder fra kundeportalen (N50) — antal, ældste, pr. kunde. Kun aggregater.
 *   npx tsx scripts/prod-portal-unread.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-portal-unread', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'kundebeskeder', (SELECT count(*)::int FROM portal_messages WHERE sender_type = 'customer'),
    'ulaeste', (SELECT count(*)::int FROM portal_messages WHERE sender_type = 'customer' AND read_at IS NULL),
    'aeldste_ulaeste_dage', (SELECT floor(extract(epoch FROM now() - min(created_at)) / 86400)::int FROM portal_messages WHERE sender_type = 'customer' AND read_at IS NULL),
    'kunder_med_ulaeste', (SELECT count(DISTINCT customer_id)::int FROM portal_messages WHERE sender_type = 'customer' AND read_at IS NULL),
    'sender_typer', (SELECT json_object_agg(sender_type, n) FROM (SELECT sender_type, count(*)::int n FROM portal_messages GROUP BY 1) x),
    'seneste_kundebesked', (SELECT max(created_at)::date FROM portal_messages WHERE sender_type = 'customer')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
