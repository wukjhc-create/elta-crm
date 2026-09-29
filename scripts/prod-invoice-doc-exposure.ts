/**
 * PRODUCTION read-only: er leverandoerfaktura-mails koblet til kunder, og ligger deres vedhaeftninger allerede i
 * customer_documents (= synlige i kundeportalen)? Kun antal.
 *   npx tsx scripts/prod-invoice-doc-exposure.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-invoice-doc-exposure', async (run, masked) => {
  console.log(`--- faktura-mails ↔ kundedokumenter @ prod:${masked} ---`)
  console.log('  faktura-mails koblet til kunde:', JSON.stringify((await run(`SELECT count(DISTINCT e.id)::int mails,
      count(DISTINCT e.id) FILTER (WHERE e.customer_id IS NOT NULL)::int koblet_til_kunde,
      count(DISTINCT e.id) FILTER (WHERE e.customer_id IS NOT NULL AND e.has_attachments)::int koblet_med_vedhaeftning
    FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id WHERE i.source = 'email'`))[0]))
  console.log('  kundedokumenter fra faktura-mails (synlige i portal):', JSON.stringify((await run(`SELECT count(*)::int dokumenter, count(DISTINCT d.customer_id)::int kunder
    FROM customer_documents d WHERE d.source_email_id IN (SELECT source_email_id FROM incoming_invoices WHERE source='email' AND source_email_id IS NOT NULL)`))[0]))
  console.log('  alle mail-arkiverede kundedokumenter:', JSON.stringify((await run(`SELECT count(*)::int dokumenter, count(DISTINCT customer_id)::int kunder
    FROM customer_documents WHERE source_email_id IS NOT NULL`))[0]))
  console.log('  heraf fra leverandør-afsendere (domæne matcher leverandør-kode/navn):', JSON.stringify((await run(`SELECT count(*)::int dokumenter
    FROM customer_documents d JOIN incoming_emails e ON e.id = d.source_email_id
    WHERE EXISTS (SELECT 1 FROM suppliers s WHERE s.code IS NOT NULL AND length(s.code) >= 2 AND lower(split_part(e.sender_email,'@',2)) LIKE '%' || lower(s.code) || '%')`))[0]))
  console.log('  aktive portal-tokens for disse kunder:', JSON.stringify((await run(`SELECT count(*)::int tokens FROM portal_access_tokens t
    WHERE t.is_active AND (t.expires_at IS NULL OR t.expires_at > now()) AND t.customer_id IN (
      SELECT d.customer_id FROM customer_documents d WHERE d.source_email_id IN (SELECT source_email_id FROM incoming_invoices WHERE source='email'))`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
