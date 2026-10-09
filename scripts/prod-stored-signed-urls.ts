/**
 * PRODUCTION read-only: gemte signerede download-links (Supabase /storage/v1/object/sign/…?token=…) i URL-felter.
 * Kun antal og tjeksummer — ingen URL'er/værdier ud.   npx tsx scripts/prod-stored-signed-urls.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const SIGN = `'%/storage/v1/object/sign/%'`

withProdReadOnly('prod-stored-signed-urls', async (run, masked) => {
  const rows = await run(`SELECT
      (SELECT count(*) FROM customer_documents WHERE file_url LIKE ${SIGN}) cd_signed,
      (SELECT count(*) FROM customer_documents WHERE file_url LIKE ${SIGN} AND coalesce(storage_path, '') = '') cd_signed_no_path,
      (SELECT count(*) FROM customer_documents) cd_total,
      (SELECT md5(string_agg(id::text || coalesce(storage_path, '') || coalesce(file_name, '') || coalesce(document_type, '') || coalesce(description, ''), '|' ORDER BY id)) FROM customer_documents) cd_checksum,
      (SELECT count(*) FROM service_case_attachments WHERE file_url LIKE ${SIGN}) sca_signed,
      (SELECT count(*) FROM service_case_attachments WHERE file_url LIKE ${SIGN} AND coalesce(storage_path, '') = '') sca_signed_no_path,
      (SELECT count(*) FROM service_case_attachments) sca_total,
      (SELECT md5(string_agg(id::text || coalesce(storage_path, '') || coalesce(file_name, ''), '|' ORDER BY id)) FROM service_case_attachments) sca_checksum,
      (SELECT count(*) FROM incoming_emails WHERE attachment_urls::text LIKE ${SIGN}) mail_json_signed,
      (SELECT count(*) FROM roof_drawings WHERE coalesce(to_jsonb(roof_drawings)::text, '') LIKE ${SIGN}) roof_signed`)
  console.log(`--- gemte signerede links @ prod:${masked} ---`)
  console.log(JSON.stringify(rows[0], null, 1))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
