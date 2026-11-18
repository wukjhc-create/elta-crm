/**
 * 00250 — read-only dormancy-tjek EFTER permanent anvendelse (og igen efter N dage). Kun tællinger ud.
 *   npx tsx scripts/prod-00250-post-dormancy.ts --since ISO
 * Bevis for at ALT står FRA: ingen henvendelser (mail/portal), ingen web-chat, ingen værn-rækker, ingen afstemning/retention,
 * ingen kunder/sager/opgaver/SMS skabt af hub'en. Mail-triggeren findes, men er en no-op uden henvendelser.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const i = process.argv.indexOf('--since')
const since = i > 0 ? String(process.argv[i + 1]) : ''
if (Number.isNaN(Date.parse(since))) throw new Error('kræver --since ISO')
const iso = new Date(since).toISOString()

withProdReadOnly('prod-00250-post-dormancy', async (run) => {
  const r = (await run(`SELECT
    (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'trg_incoming_emails_reception_reconcile' AND tgenabled = 'O') trg,
    (SELECT count(*)::int FROM conversations WHERE created_at > '${iso}'::timestamptz) conv, (SELECT count(*)::int FROM conversation_items WHERE created_at > '${iso}'::timestamptz) items,
    (SELECT count(*)::int FROM web_chat_sessions) ws, (SELECT count(*)::int FROM web_chat_messages) wm, (SELECT count(*)::int FROM web_chat_rate_limits) rl,
    (SELECT count(*)::int FROM audit_logs WHERE created_at > '${iso}'::timestamptz AND action IN ('conversation_ingested','conversation_item_appended','conversation_ingest_merged','conversation_source_reconciled','conversation_reconcile_failed','conversation_item_detached','conversation_created_by_relink','reception_retention_applied')) hub_audit,
    (SELECT count(*)::int FROM incoming_emails WHERE linked_by = 'manual' AND linked_at > '${iso}'::timestamptz) manual_links_since,
    (SELECT count(*)::int FROM sms_messages WHERE created_at > '${iso}'::timestamptz) new_sms`))[0]
  const res: Array<[string, boolean, string]> = [
    ['mail-afstemnings-triggeren findes og er slået til (no-op uden henvendelser)', r.trg === 1, `${r.trg}`],
    ['0 NYE henvendelser/items siden --since (RECEPTION_EMAIL/PORTAL_INGEST FRA, backfill FRA; de 32 fra 2026-11-18 er baseline)', r.conv === 0 && r.items === 0, `${r.conv}/${r.items}`],
    ['0 web-chat-sessioner/-beskeder/værn-rækker (RECEPTION_WEBCHAT FRA)', r.ws + r.wm + r.rl === 0, `${r.ws}/${r.wm}/${r.rl}`],
    ['ingen hub-/afstemnings-/retention-audit siden deploy (RECEPTION_RETENTION_APPLY FRA, cron ikke planlagt)', r.hub_audit === 0, `${r.hub_audit}`],
    ['ingen SMS-rækker siden deploy', r.new_sms === 0, `${r.new_sms}`],
  ]
  console.log(`INFO  manuelle mail-koblinger siden deploy (trigger kørt som no-op): ${r.manual_links_since}`)
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${note}`)
  process.exitCode = res.some((x) => !x[1]) ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
