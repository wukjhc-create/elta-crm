/**
 * PRODUCTION read-only: afsender af de faktura-mails hvis vedhaeftninger ligger i customer_documents — er det
 * kunden selv eller en tredjepart (leverandoer)? Kun booleans/antal.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-invoice-doc-exposure-detail', async (run) => {
  console.log(JSON.stringify(await run(`SELECT
      (lower(e.sender_email) = lower(c.email)) afsender_er_kunden,
      (lower(split_part(e.sender_email,'@',2)) = lower(split_part(c.email,'@',2))) samme_domaene,
      (lower(split_part(e.sender_email,'@',2)) IN ('eltasolar.dk')) intern_afsender,
      i.status, i.parse_status, d.mime_type, count(*)::int n
    FROM customer_documents d JOIN incoming_emails e ON e.id = d.source_email_id JOIN customers c ON c.id = d.customer_id
    JOIN incoming_invoices i ON i.source_email_id = e.id
    GROUP BY 1,2,3,4,5,6`)))
  console.log('tokens pr. kunde (antal kunder med >5 aktive):', JSON.stringify(await run(`SELECT count(*)::int kunder FROM (SELECT customer_id FROM portal_access_tokens
    WHERE is_active AND (expires_at IS NULL OR expires_at > now()) GROUP BY 1 HAVING count(*) > 5) x`)))
  console.log('faktura-mails koblet til kunde — afsender er kunden selv?', JSON.stringify(await run(`SELECT (lower(e.sender_email) = lower(c.email)) afsender_er_kunden,
      (lower(split_part(e.sender_email,'@',2)) = lower(split_part(c.email,'@',2))) samme_domaene, e.has_attachments, count(DISTINCT e.id)::int n
    FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id JOIN customers c ON c.id = e.customer_id WHERE i.source='email' GROUP BY 1,2,3`)))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
