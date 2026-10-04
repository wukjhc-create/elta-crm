/**
 * PRODUCTION read-only: afviste leverandørfakturaer — afvisningsgrund (kun kategori/længde-afkortet) og om afsenderen
 * er gratis-mail; plus åbne fakturaer fra gratis-mail. Ingen personadresser udskrives (kun domæner).
 *   npx tsx scripts/prod-incoming-invoice-rejects.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const FREE = `('gmail.com','hotmail.com','hotmail.dk','live.com','live.dk','outlook.com','outlook.dk','yahoo.com','yahoo.dk','icloud.com','me.com','msn.com')`

withProdReadOnly('prod-incoming-invoice-rejects', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'afviste_grunde', (SELECT json_agg(json_build_object('grund', g, 'n', n) ORDER BY n DESC) FROM (
        SELECT left(coalesce(i.rejected_reason, '(ingen)'), 60) g, count(*)::int n FROM incoming_invoices i WHERE i.status = 'rejected' GROUP BY 1) x),
    'afviste_gratis_mail', (SELECT count(*)::int FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id
        WHERE i.status = 'rejected' AND lower(split_part(e.sender_email, '@', 2)) IN ${FREE}),
    'aabne_gratis_mail', (SELECT count(*)::int FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id
        WHERE i.status = 'awaiting_approval' AND lower(split_part(e.sender_email, '@', 2)) IN ${FREE}),
    'aabne_uden_pdf_vedhaeftning', (SELECT count(*)::int FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id
        WHERE i.status = 'awaiting_approval' AND NOT coalesce(e.has_attachments, false)),
    'aabne_emner', (SELECT json_agg(left(e.subject, 50)) FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id
        WHERE i.status = 'awaiting_approval' AND lower(split_part(e.sender_email, '@', 2)) IN ${FREE})
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
