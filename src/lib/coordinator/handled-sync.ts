/**
 * Phase C (Stage A-sammenhæng, D2) — én henvendelse behandles kun ét sted. Server-modul (IKKE 'use server').
 * Kun med COORDINATOR_ENABLED. Alt skrives med brugerens EGEN klient (RLS + guard-triggere) og auditeres.
 *
 *  - Mail arkiveret/ignoreret i mail-modulet → Stage A-henvendelsen lukkes, når ALLE dens mails er færdige
 *    (en tråd med en ny, ubehandlet mail forbliver åben). Kræver conversations.manage.
 *  - Henvendelse markeret håndteret i Henvendelser → dens mails arkiveres (genåbn = "Genåbn" i arbejdskøen/mail). Kræver
 *    inbox.view.
 * Fejl her vælter aldrig den oprindelige handling (best effort, logges som audit-fejl).
 */
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { coordinatorEnabled } from './feature-flag'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function closeConversationIfMailsDone(db: Db, userId: string, emailId: string, canManage: boolean): Promise<{ closed: string | null }> {
  if (!coordinatorEnabled() || !canManage) return { closed: null }
  try {
    const it = await db.from('conversation_items').select('conversation_id').eq('source_table', 'incoming_emails').eq('source_id', emailId).limit(1)
    const convId = ((it.data ?? []) as Array<{ conversation_id: string }>)[0]?.conversation_id
    if (!convId) return { closed: null }
    const items = await db.from('conversation_items').select('source_table, source_id').eq('conversation_id', convId).limit(500)
    const rows = (items.data ?? []) as Array<{ source_table: string; source_id: string }>
    if (rows.some((r) => r.source_table !== 'incoming_emails')) return { closed: null } // andre kanaler afsluttes i Henvendelser
    const mails = await db.from('incoming_emails').select('id, is_archived, link_status').in('id', rows.map((r) => r.source_id))
    const m = (mails.data ?? []) as Array<{ id: string; is_archived: boolean | null; link_status: string | null }>
    if (m.length !== rows.length || !m.every((x) => x.is_archived || x.link_status === 'ignored')) return { closed: null }
    const u = await db.from('conversations').update({ status: 'handled', handled_at: new Date().toISOString(), handled_by: userId, next_action: null })
      .eq('id', convId).neq('status', 'handled').select('id')
    if (u.error || !(u.data ?? []).length) return { closed: null }
    await insertAuditRow({ user_id: userId, entity_type: 'conversation', entity_id: convId, action: 'conversation_handled',
      action_description: 'Henvendelse afsluttet (mailen er færdigbehandlet)', metadata: { actor: 'user', via: 'mail_done', email_id: emailId } })
    return { closed: convId }
  } catch { return { closed: null } }
}

export async function archiveMailsForConversation(db: Db, userId: string, conversationId: string, canInbox: boolean): Promise<{ archived: number }> {
  if (!coordinatorEnabled() || !canInbox) return { archived: 0 }
  try {
    const items = await db.from('conversation_items').select('source_id').eq('conversation_id', conversationId).eq('source_table', 'incoming_emails').limit(500)
    const ids = ((items.data ?? []) as Array<{ source_id: string }>).map((r) => r.source_id)
    if (!ids.length) return { archived: 0 }
    const u = await db.from('incoming_emails').update({ is_archived: true, is_read: true }).in('id', ids).eq('is_archived', false).select('id')
    const n = (u.data ?? []).length
    if (n) await insertAuditRow({ user_id: userId, entity_type: 'conversation', entity_id: conversationId, action: 'coordinator_mails_archived',
      action_description: 'Henvendelsens mails arkiveret (henvendelsen er håndteret)', metadata: { actor: 'user', count: n } })
    return { archived: n }
  } catch { return { archived: 0 } }
}
