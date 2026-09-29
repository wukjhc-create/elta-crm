/**
 * PRODUCTION read-only: baseline/efter-maaling for faktura-vedhaeftnings-backfill (IC11). Kun antal — ingen id'er,
 * navne, adresser eller tekster.
 *   npx tsx scripts/prod-invoice-attachment-baseline.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-invoice-attachment-baseline', async (run, masked) => {
  console.log(`--- faktura-vedhæftnings-baseline @ prod:${masked} ---`)
  const cols = (await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='incoming_emails'
    AND (column_name ILIKE '%mailbox%' OR column_name ILIKE '%recipient%' OR column_name = 'to_email' OR column_name ILIKE '%graph%')`)) as Array<{ column_name: string }>
  console.log('  mailbox-/graph-kolonner:', cols.map((c) => c.column_name).join(', ') || '(ingen)')
  const has = (c: string) => cols.some((x) => x.column_name === c)
  console.log('  faktura-mails:', JSON.stringify((await run(`SELECT count(DISTINCT e.id)::int mails,
      count(DISTINCT e.id) FILTER (WHERE e.has_attachments)::int med_vedhaeftning,
      count(DISTINCT e.id) FILTER (WHERE e.attachment_urls IS NOT NULL AND e.attachment_urls::text NOT IN ('[]','null',''))::int med_urls,
      count(DISTINCT e.id) FILTER (WHERE e.has_attachments AND (e.attachment_urls IS NULL OR e.attachment_urls::text IN ('[]','null','')))::int mangler_urls,
      count(DISTINCT e.id) FILTER (WHERE e.graph_message_id IS NULL)::int uden_graph_id
    FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id WHERE i.source = 'email'`))[0]))
  if (has('mailbox')) console.log('  mailbox-fordeling (backfill-kandidater):', JSON.stringify(await run(`SELECT (e.mailbox IS NULL) mailbox_mangler, count(DISTINCT e.id)::int n
    FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id WHERE i.source='email' AND e.has_attachments
    AND (e.attachment_urls IS NULL OR e.attachment_urls::text IN ('[]','null','')) GROUP BY 1`)))
  console.log('  fakturaer status/parse:', JSON.stringify(await run(`SELECT source, status, parse_status, count(*)::int n FROM incoming_invoices GROUP BY 1,2,3 ORDER BY 1,2,3`)))
  console.log('  fakturaer pr. filtype:', JSON.stringify(await run(`SELECT coalesce(mime_type,'?') mime, count(*)::int n FROM incoming_invoices GROUP BY 1 ORDER BY 2 DESC`)))
  console.log('  lås-statusser blandt mail-fakturaer:', JSON.stringify(await run(`SELECT status, count(*)::int n FROM incoming_invoices WHERE source='email' GROUP BY 1`)))
  console.log('  fakturalinjer:', JSON.stringify((await run(`SELECT count(*)::int linjer, count(DISTINCT incoming_invoice_id)::int fakturaer,
      count(*) FILTER (WHERE supplier_product_id IS NOT NULL)::int produkt_matchet FROM incoming_invoice_lines`))[0]))
  console.log('  e-conomic/finance (skal vaere uaendret):', JSON.stringify((await run(`SELECT count(*) FILTER (WHERE status='posted')::int posted,
      count(*) FILTER (WHERE status='approved')::int approved, count(*) FILTER (WHERE external_invoice_id IS NOT NULL)::int med_ekstern_id FROM incoming_invoices`).catch(async () =>
      run(`SELECT count(*) FILTER (WHERE status='posted')::int posted, count(*) FILTER (WHERE status='approved')::int approved FROM incoming_invoices`)))[0]))
  console.log('  storage email-attachments (objekter):', JSON.stringify((await run(`SELECT count(*)::int objekter,
      count(*) FILTER (WHERE name LIKE 'email-attachments/%')::int email_vedhaeftninger FROM storage.objects WHERE bucket_id = 'attachments'`))[0]))
  console.log('  attachments-bucket public:', JSON.stringify(await run(`SELECT id, public FROM storage.buckets WHERE id = 'attachments'`)))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
