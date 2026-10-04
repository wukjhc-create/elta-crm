/**
 * PRODUCTION read-only: uidentificerede mails — kunne en kunde foreslås via firmadomæne (samme domæne som en kundes
 * e-mail, aldrig gratis-mail) eller via webhenvendelse/gratis-mail? Kun antal.
 *   npx tsx scripts/prod-unidentified-mail-hints.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const FREE = `('gmail.com','hotmail.com','hotmail.dk','live.com','live.dk','outlook.com','outlook.dk','yahoo.com','yahoo.dk','icloud.com','me.com','msn.com','mail.dk','formsubmit.co')`
const DOM = `lower(split_part(e.sender_email, '@', 2))`

withProdReadOnly('prod-unidentified-mail-hints', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'uidentificerede', (SELECT count(*)::int FROM incoming_emails e WHERE e.link_status = 'unidentified' AND NOT e.is_archived),
    'gratis_mail', (SELECT count(*)::int FROM incoming_emails e WHERE e.link_status = 'unidentified' AND NOT e.is_archived AND ${DOM} IN ${FREE}),
    'firmadomaene', (SELECT count(*)::int FROM incoming_emails e WHERE e.link_status = 'unidentified' AND NOT e.is_archived AND ${DOM} NOT IN ${FREE} AND ${DOM} <> 'eltasolar.dk'),
    'firmadomaene_med_kunde', (SELECT count(*)::int FROM incoming_emails e WHERE e.link_status = 'unidentified' AND NOT e.is_archived AND ${DOM} NOT IN ${FREE}
        AND EXISTS (SELECT 1 FROM customers c WHERE lower(split_part(c.email, '@', 2)) = ${DOM})),
    'firmadomaene_med_praecis_een_kunde', (SELECT count(*)::int FROM incoming_emails e WHERE e.link_status = 'unidentified' AND NOT e.is_archived AND ${DOM} NOT IN ${FREE}
        AND (SELECT count(*) FROM customers c WHERE lower(split_part(c.email, '@', 2)) = ${DOM}) = 1),
    'fra_eltasolar', (SELECT count(*)::int FROM incoming_emails e WHERE e.link_status = 'unidentified' AND NOT e.is_archived AND ${DOM} = 'eltasolar.dk')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
