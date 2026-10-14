/**
 * PRODUCTION read-only: mail-vedhæftninger i incoming_emails.attachment_urls — hvor mange har gemte (1-års) links,
 * og hvor mange har link UDEN storagePath (ville ikke længere vises, når UI'et signerer fra storagePath).
 * Kun antal — ingen URL'er/værdier ud.   npx tsx scripts/prod-mail-attachment-links.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-mail-attachment-links', async (run, masked) => {
  const rows = await run(`SELECT
      count(*) AS attachments,
      count(*) FILTER (WHERE coalesce(att->>'url', '') <> '') AS with_url,
      count(*) FILTER (WHERE coalesce(att->>'url', '') LIKE '%/storage/v1/object/sign/%') AS with_signed_url,
      count(*) FILTER (WHERE coalesce(att->>'storagePath', '') <> '') AS with_path,
      count(*) FILTER (WHERE coalesce(att->>'url', '') <> '' AND coalesce(att->>'storagePath', '') = '') AS url_without_path,
      count(*) FILTER (WHERE coalesce(att->>'storagePath', '') <> '' AND att->>'storagePath' NOT LIKE 'email-attachments/' || a.id || '/%') AS path_outside_own_folder,
      count(DISTINCT id) AS emails
    FROM (SELECT e.id, x.value AS att
      FROM incoming_emails e, jsonb_array_elements(CASE WHEN jsonb_typeof(e.attachment_urls::jsonb) = 'array' THEN e.attachment_urls::jsonb ELSE '[]'::jsonb END) x) a`)
  console.log(`--- mail-vedhæftningslinks @ prod:${masked} ---`)
  console.log(JSON.stringify(rows[0], null, 1))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
