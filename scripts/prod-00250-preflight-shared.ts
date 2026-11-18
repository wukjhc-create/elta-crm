/**
 * Delt mellem prod-00250-preflight.ts og prod-00250-dryrun.ts: data-fingeraftryk (antal + md5 af hele rækken) for de
 * kanoniske kilder 00250 læser/afstemmer (mail, portal, opkald, kunder, sager) + 00249-tabellerne + katalog/standarder.
 * Ingen personværdier ud — kun "antal:md5".
 */
// 00250's NYE kolonner trækkes fra (jsonb - nøgle er en no-op før anvendelse), så fingeraftrykket måler om EKSISTERENDE
// værdier er uændrede — ikke at rækken har fået nye (tomme) kolonner
const NEW_COLS = `- 'thread_key' - 'text_purged_at' - 'customer_deleted_at' - 'case_deleted_at' - 'attachment_refs' - 'source_missing_at'`
const md5 = (t: string, order = 'x.id') => `(SELECT count(*)::int || ':' || md5(coalesce(string_agg((to_jsonb(x) ${NEW_COLS})::text, '|' ORDER BY ${order}), '')) FROM public.${t} x)`
export const FP_00250: Array<[string, string]> = [['customers', 'x.id'], ['service_cases', 'x.id'], ['incoming_emails', 'x.id'], ['portal_messages', 'x.id'],
  ['telephony_calls', 'x.id'], ['telephony_events', 'x.id'], ['customer_documents', 'x.id'], ['customer_tasks', 'x.id'], ['customer_contacts', 'x.id'],
  ['offers', 'x.id'], ['profiles', 'x.id'], ['user_permission_overrides', 'x.profile_id, x.permission'], ['permission_catalog', 'x.permission'],
  ['role_permission_defaults', 'x.role, x.permission'], ['conversations', 'x.id'], ['conversation_items', 'x.id'], ['conversation_actions', 'x.id'], ['upload_requests', 'x.id']]
export const FP_00250_SQL = `SELECT ${FP_00250.map(([t, o]) => `${md5(t, o)} AS ${t}`).join(', ')}`

/** Objekter 00250 opretter (til fravær/tilstedeværelse) */
export const T250 = `('web_chat_sessions','web_chat_messages','web_chat_rate_limits')`
export const F250 = `('conversation_items_update_guard','reception_retention','reception_detach_item','reception_reconcile_source','incoming_emails_reception_reconcile','web_chat_rate_check')`
export const TRG250 = `('trg_conversation_items_update_guard','trg_incoming_emails_reception_reconcile')`
export const COLS250 = `(('conversations','thread_key'),('conversations','text_purged_at'),('conversations','customer_deleted_at'),('conversations','case_deleted_at'),('conversation_items','attachment_refs'),('conversation_items','text_purged_at'),('conversation_items','source_missing_at'))`
/** Funktioner 00250 genskaber (CREATE OR REPLACE — ACL fra 00249 bevares) */
export const F_REPLACED = `('reception_source_identity','reception_source_visible','conversations_guard','conversation_items_guard','reception_ingest')`
