/**
 * ELTA Assistant (T3/T4) — påmindelser. CRM er source of truth: kandidaterne læses fra customer_tasks.reminder_at
 * hver gang; der findes INGEN kopi af tidspunktet i assistent-laget. Flyttes tiden i CRM, gælder den nye tid.
 *
 * "Sendt"-markering = audit_logs-række (action assistant_reminder_sent, metadata.reminder_at = det tidspunkt der
 * blev påmindet om). Samme opgave + samme tidspunkt sendes aldrig to gange; et NYT tidspunkt sendes igen.
 * Afsendelsen (Telegram) er en indsprøjtet funktion — her sendes intet live.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ASSISTANT_RULES } from './rules'

/** Hvor langt tilbage en overset påmindelse stadig sendes (fx efter nedetid) */
export const REMINDER_CATCHUP_MIN = 60

export type DueReminder = { taskId: string; title: string; customerId: string; assignedTo: string | null; dueDate: string | null; reminderAt: string }

const sameInstant = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime()

export async function findDueAssistantReminders(admin: SupabaseClient, now: Date = new Date()): Promise<DueReminder[]> {
  const from = new Date(now.getTime() - REMINDER_CATCHUP_MIN * 60_000).toISOString()
  const { data, error } = await admin
    .from('customer_tasks')
    .select('id, title, customer_id, assigned_to, due_date, reminder_at, status')
    .in('auto_rule', ASSISTANT_RULES)
    .neq('status', 'done')
    .not('reminder_at', 'is', null)
    .lte('reminder_at', now.toISOString())
    .gte('reminder_at', from)
    .order('reminder_at')
    .limit(200)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; title: string; customer_id: string; assigned_to: string | null; due_date: string | null; reminder_at: string }>
  if (!rows.length) return []
  const { data: sent, error: sErr } = await admin
    .from('audit_logs')
    .select('entity_id, metadata')
    .eq('action', 'assistant_reminder_sent')
    .in('entity_id', rows.map((r) => r.id))
  if (sErr) throw sErr
  const sentAt = new Map<string, string[]>()
  for (const s of (sent ?? []) as Array<{ entity_id: string; metadata: { reminder_at?: string } | null }>) {
    const list = sentAt.get(s.entity_id) ?? []
    if (s.metadata?.reminder_at) list.push(s.metadata.reminder_at)
    sentAt.set(s.entity_id, list)
  }
  return rows
    .filter((r) => !(sentAt.get(r.id) ?? []).some((t) => sameInstant(t, r.reminder_at)))
    .map((r) => ({ taskId: r.id, title: r.title, customerId: r.customer_id, assignedTo: r.assigned_to, dueDate: r.due_date, reminderAt: r.reminder_at }))
}

export type ReminderSender = (reminder: DueReminder) => Promise<{ delivered: boolean; channel: string; detail?: string }>

/**
 * Send de forfaldne påmindelser via `send` og markér hver leveret i audit_logs. Fejl ved én påmindelse stopper
 * ikke de øvrige; en ikke-leveret påmindelse markeres ikke (forsøges igen næste kørsel inden for catch-up-vinduet).
 */
export async function dispatchAssistantReminders(admin: SupabaseClient, send: ReminderSender, now: Date = new Date()): Promise<{ due: number; delivered: number; failed: number }> {
  const due = await findDueAssistantReminders(admin, now)
  let delivered = 0
  let failed = 0
  for (const r of due) {
    try {
      const res = await send(r)
      if (!res.delivered) { failed++; continue }
      await admin.from('audit_logs').insert({
        user_id: r.assignedTo,
        entity_type: 'customer_task',
        entity_id: r.taskId,
        entity_name: r.title.slice(0, 120),
        action: 'assistant_reminder_sent',
        action_description: `Påmindelse sendt (${res.channel})`,
        metadata: { channel: res.channel, reminder_at: r.reminderAt, due_date: r.dueDate },
      })
      delivered++
    } catch {
      failed++
    }
  }
  return { due: due.length, delivered, failed }
}
