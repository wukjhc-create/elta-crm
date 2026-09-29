/**
 * PRODUCTION read-only: hvilke filtyper/kilder kommer leverandoerfakturaer fra? (kun antal, ingen navne/indhold)
 *   npx tsx scripts/prod-invoice-sources.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-invoice-sources', async (run, masked) => {
  console.log(`--- leverandørfaktura-kilder @ prod:${masked} ---`)
  console.log('  fakturaer pr. kilde/mime/parse:', JSON.stringify(await run(`SELECT source, coalesce(mime_type,'?') mime,
    lower(coalesce(substring(file_name from '\\.([A-Za-z0-9]+)$'),'?')) ext, parse_status, count(*)::int n FROM incoming_invoices GROUP BY 1,2,3,4 ORDER BY 5 DESC`)))
  const cols = (await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='incoming_emails' AND column_name ILIKE '%attach%'`)) as Array<{ column_name: string }>
  console.log('  vedhæftnings-kolonner i incoming_emails:', cols.map((c) => c.column_name).join(', ') || '(ingen)')
  console.log('  mails bag mail-fakturaer:', JSON.stringify(await run(`SELECT count(*)::int mails,
      count(*) FILTER (WHERE e.has_attachments)::int med_vedhaeftning,
      count(*) FILTER (WHERE e.attachment_urls IS NOT NULL AND e.attachment_urls::text NOT IN ('[]','null',''))::int med_urls
    FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id WHERE i.source = 'email'`)))
  console.log('  alle mails (30 d):', JSON.stringify(await run(`SELECT count(*)::int mails, count(*) FILTER (WHERE has_attachments)::int med_vedhaeftning,
      count(*) FILTER (WHERE attachment_urls IS NOT NULL AND attachment_urls::text NOT IN ('[]','null',''))::int med_urls
    FROM incoming_emails WHERE received_at > now() - interval '30 days'`)))
  const shape = (await run(`SELECT jsonb_typeof(attachment_urls::jsonb) t, count(*)::int n FROM incoming_emails
    WHERE attachment_urls IS NOT NULL AND attachment_urls::text NOT IN ('[]','null','') GROUP BY 1`).catch(() => [])) as any[]
  console.log('  attachment_urls-form:', JSON.stringify(shape))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
