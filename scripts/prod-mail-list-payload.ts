/**
 * PRODUCTION read-only: N85 payload før/efter for mail-listen (25 nyeste ikke-arkiverede, ikke-ignorerede):
 * før = alle kolonner (select *), efter = listekolonnerne uden body_html/body_text. JSON-størrelse i KB.
 *   npx tsx scripts/prod-mail-list-payload.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const COLS = 'id, graph_message_id, conversation_id, subject, sender_email, sender_name, original_sender_email, original_sender_name, to_email, cc, reply_to, body_preview, attachment_urls, has_attachments, link_status, customer_id, customer_contact_id, linked_by, linked_at, ao_product_matches, has_ao_matches, is_read, is_archived, is_forwarded, processed_at, received_at, created_at, updated_at, service_case_id'

withProdReadOnly('prod-mail-list-payload', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'foer_kb', (SELECT round(sum(octet_length(row_to_json(e)::text)) / 1024.0, 1) FROM (SELECT * FROM incoming_emails WHERE NOT is_archived AND link_status <> 'ignored' ORDER BY received_at DESC LIMIT 25) e),
    'efter_kb', (SELECT round(sum(octet_length(row_to_json(e)::text)) / 1024.0, 1) FROM (SELECT ${COLS} FROM incoming_emails WHERE NOT is_archived AND link_status <> 'ignored' ORDER BY received_at DESC LIMIT 25) e),
    'en_mail_ved_aabning_gns_kb', (SELECT round(avg(octet_length(coalesce(body_html, '') || coalesce(body_text, ''))) / 1024.0, 1) FROM (SELECT body_html, body_text FROM incoming_emails WHERE NOT is_archived AND link_status <> 'ignored' ORDER BY received_at DESC LIMIT 25) e)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
