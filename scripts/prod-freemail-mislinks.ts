/** PRODUCTION read-only (kommunikations-review): mails koblet til en kunde hvor afsender ≠ kundens e-mail men samme gratis-maildomæne (domæne-match-fejl). Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { FREE_MAIL_DOMAINS } from '../src/lib/email/free-mail-domains'
const list = Array.from(FREE_MAIL_DOMAINS).map((d) => `'${d.replace(/'/g, '')}'`).join(',')
withProdReadOnly('prod-freemail-mislinks', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'mistaenkte_mails', (SELECT count(*)::int FROM incoming_emails e JOIN customers c ON c.id = e.customer_id
      WHERE lower(split_part(e.sender_email, '@', 2)) IN (${list})
        AND lower(e.sender_email) <> lower(coalesce(c.email, ''))
        AND lower(split_part(e.sender_email, '@', 2)) = lower(split_part(coalesce(c.email, ''), '@', 2))
        AND NOT EXISTS (SELECT 1 FROM customer_contacts cc WHERE cc.customer_id = c.id AND lower(cc.email) = lower(e.sender_email))),
    'kunder_beroert', (SELECT count(DISTINCT e.customer_id)::int FROM incoming_emails e JOIN customers c ON c.id = e.customer_id
      WHERE lower(split_part(e.sender_email, '@', 2)) IN (${list})
        AND lower(e.sender_email) <> lower(coalesce(c.email, ''))
        AND lower(split_part(e.sender_email, '@', 2)) = lower(split_part(coalesce(c.email, ''), '@', 2))
        AND NOT EXISTS (SELECT 1 FROM customer_contacts cc WHERE cc.customer_id = c.id AND lower(cc.email) = lower(e.sender_email)))
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
