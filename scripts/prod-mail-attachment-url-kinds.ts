/**
 * PRODUCTION read-only: hvilken slags URL står i incoming_emails.attachment_urls[].url (kun typer/antal, ingen værdier),
 * og første mappe-niveau for storagePath uden for mailens egen mappe.   npx tsx scripts/prod-mail-attachment-url-kinds.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-mail-attachment-url-kinds', async (run, masked) => {
  const rows = await run(`SELECT
      CASE
        WHEN att->>'url' LIKE '%/storage/v1/object/public/%' THEN 'storage-public'
        WHEN att->>'url' LIKE '%/storage/v1/object/sign/%' THEN 'storage-sign'
        WHEN att->>'url' LIKE '%/storage/v1/%' THEN 'storage-other'
        WHEN att->>'url' LIKE 'https://graph.microsoft.com%' THEN 'graph'
        WHEN coalesce(att->>'url', '') = '' THEN 'tom'
        ELSE 'anden'
      END AS kind,
      split_part(coalesce(att->>'storagePath', ''), '/', 1) AS path_root,
      (att->>'storagePath' LIKE 'email-attachments/' || id || '/%') AS own_folder,
      count(*) AS n
    FROM (SELECT e.id, x.value AS att
      FROM incoming_emails e, jsonb_array_elements(CASE WHEN jsonb_typeof(e.attachment_urls::jsonb) = 'array' THEN e.attachment_urls::jsonb ELSE '[]'::jsonb END) x) a
    GROUP BY 1, 2, 3 ORDER BY 4 DESC`)
  console.log(`--- url-typer @ prod:${masked} ---`)
  for (const r of rows) console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
