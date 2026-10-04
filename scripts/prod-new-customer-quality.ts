/**
 * PRODUCTION read-only: kvalitet af nye kunder (90 d) — hvem/hvad oprettede dem (created_by null = automatik),
 * kilde i custom_fields, gratis-mail vs. firmadomæne, telefon/adresse udfyldt, leverandør-/systemdomæner. Kun antal og
 * domæner (ingen personadresser).
 *   npx tsx scripts/prod-new-customer-quality.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const NEW = `FROM customers c WHERE c.created_at > now() - interval '90 days'`
const FREE = `('gmail.com','hotmail.com','hotmail.dk','live.com','live.dk','outlook.com','outlook.dk','yahoo.com','yahoo.dk','icloud.com','me.com','msn.com','mail.dk')`

withProdReadOnly('prod-new-customer-quality', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'nye_90d', (SELECT count(*)::int ${NEW}),
    'automatisk', (SELECT count(*)::int ${NEW} AND c.created_by IS NULL),
    'kilder', (SELECT json_object_agg(k, n) FROM (SELECT coalesce(c.custom_fields->>'source', '(ingen)') k, count(*)::int n ${NEW} GROUP BY 1) x),
    'gratis_mail', (SELECT count(*)::int ${NEW} AND lower(split_part(c.email, '@', 2)) IN ${FREE}),
    'med_telefon', (SELECT count(*)::int ${NEW} AND coalesce(c.phone, c.mobile, '') <> ''),
    'med_adresse', (SELECT count(*)::int ${NEW} AND coalesce(c.billing_address, '') <> ''),
    'firmadomaener', (SELECT json_agg(json_build_object('d', d, 'n', n) ORDER BY n DESC) FROM (SELECT lower(split_part(c.email, '@', 2)) d, count(*)::int n ${NEW}
        AND lower(split_part(c.email, '@', 2)) NOT IN ${FREE} GROUP BY 1 ORDER BY 2 DESC LIMIT 15) x),
    'med_mails', (SELECT count(*)::int ${NEW} AND EXISTS (SELECT 1 FROM incoming_emails e WHERE e.customer_id = c.id)),
    'med_tilbud_eller_sag', (SELECT count(*)::int ${NEW} AND (EXISTS (SELECT 1 FROM offers o WHERE o.customer_id = c.id) OR EXISTS (SELECT 1 FROM service_cases s WHERE s.customer_id = c.id)))
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
