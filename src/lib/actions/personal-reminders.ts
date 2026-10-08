'use server'

/**
 * Personlige påmindelser (00197) — generel CRM-funktion uden kunde ("Mind mig om at bestille arbejdstøj fredag kl. 9").
 * Bruges direkte i CRM (Opgaver → Mine påmindelser) og af ELTA Assistant. KUN ejeren ser/ændrer sine egne:
 * alle forespørgsler går gennem bruger-klienten (RLS owner_id = auth.uid()) og filtrerer desuden på owner_id.
 * Påmindelsestidspunktet (reminder_at) er CRM-tiden; ændres det her, følger Telegram-påmindelsen automatisk.
 * Tabellen findes kun hvor 00197 er anvendt — ellers available=false, og UI'et skjules.
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { createAuditLog } from '@/lib/actions/audit'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'

export type PersonalReminder = { id: string; title: string; notes: string | null; due_at: string; reminder_at: string | null; status: 'pending' | 'done'; completed_at: string | null; source: 'manual' | 'assistant' | 'telegram' }

const PERSONAL_REMINDER_SNOOZE_MIN = 60
const COLS = 'id, title, notes, due_at, reminder_at, status, completed_at, source'

async function audit(id: string, title: string, event: string, metadata: Record<string, unknown> = {}) {
  try {
    await createAuditLog({ entity_type: 'personal_reminder', entity_id: id, entity_name: title.slice(0, 120), action: 'update', action_description: `Personlig påmindelse: ${event}`, metadata: { event: `personal_reminder_${event}`, ...metadata } })
  } catch { /* best-effort */ }
}

const validIso = (s: string) => !!s && !Number.isNaN(new Date(s).getTime())

export async function getMyPersonalReminders(): Promise<{ available: boolean; reminders: PersonalReminder[] }> {
  const { supabase, userId } = await getAuthenticatedClient()
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('personal_reminders')
    .select(COLS)
    .eq('owner_id', userId)
    .or(`status.eq.pending,completed_at.gte.${since}`)
    .order('due_at')
    .limit(200)
  if (error) return { available: false, reminders: [] }
  return { available: true, reminders: (data ?? []) as PersonalReminder[] }
}

export async function createPersonalReminder(input: { title: string; dueAt: string; reminderAt?: string | null; notes?: string | null }): Promise<{ success: boolean; id?: string; error?: string }> {
  const { supabase, userId } = await getAuthenticatedClient()
  const title = (input.title ?? '').trim()
  if (!title || title.length > 200) return { success: false, error: 'Titel skal være 1–200 tegn' }
  if (!validIso(input.dueAt)) return { success: false, error: 'Ugyldigt tidspunkt' }
  if (input.reminderAt && !validIso(input.reminderAt)) return { success: false, error: 'Ugyldigt påmindelsestidspunkt' }
  const { data, error } = await supabase
    .from('personal_reminders')
    .insert({ owner_id: userId, title, notes: input.notes?.trim() || null, due_at: new Date(input.dueAt).toISOString(), reminder_at: new Date(input.reminderAt || input.dueAt).toISOString(), source: 'manual' })
    .select('id')
    .single()
  if (error || !data) {
    logger.error('createPersonalReminder failed', { error })
    return { success: false, error: 'Kunne ikke gemme påmindelsen' }
  }
  const id = (data as { id: string }).id
  await audit(id, title, 'created', { source: 'manual' })
  revalidatePath('/dashboard/tasks')
  return { success: true, id }
}

/** Ret tidspunkt (påmindelsen flyttes med, medmindre et separat påmindelsestidspunkt angives) */
export async function reschedulePersonalReminder(id: string, dueAt: string, reminderAt?: string | null): Promise<{ success: boolean; error?: string }> {
  validateUUID(id, 'påmindelse ID')
  const { supabase, userId } = await getAuthenticatedClient()
  if (!validIso(dueAt) || (reminderAt && !validIso(reminderAt))) return { success: false, error: 'Ugyldigt tidspunkt' }
  const { data, error } = await supabase
    .from('personal_reminders')
    .update({ due_at: new Date(dueAt).toISOString(), reminder_at: new Date(reminderAt || dueAt).toISOString(), status: 'pending', completed_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', userId)
    .select('id, title')
  if (error || !(data ?? []).length) return { success: false, error: 'Påmindelsen findes ikke' }
  await audit(id, (data as Array<{ title: string }>)[0].title, 'rescheduled', { due_at: dueAt })
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function completePersonalReminder(id: string): Promise<{ success: boolean; error?: string }> {
  validateUUID(id, 'påmindelse ID')
  const { supabase, userId } = await getAuthenticatedClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase.from('personal_reminders').update({ status: 'done', completed_at: now, updated_at: now }).eq('id', id).eq('owner_id', userId).select('id, title')
  if (error || !(data ?? []).length) return { success: false, error: 'Påmindelsen findes ikke' }
  await audit(id, (data as Array<{ title: string }>)[0].title, 'done')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function snoozePersonalReminder(id: string, minutes: number = PERSONAL_REMINDER_SNOOZE_MIN): Promise<{ success: boolean; error?: string }> {
  validateUUID(id, 'påmindelse ID')
  const { supabase, userId } = await getAuthenticatedClient()
  const mins = Math.min(Math.max(Math.round(minutes), 5), 7 * 24 * 60)
  const next = new Date(Date.now() + mins * 60_000).toISOString()
  const { data, error } = await supabase.from('personal_reminders').update({ reminder_at: next, updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', userId).eq('status', 'pending').select('id, title')
  if (error || !(data ?? []).length) return { success: false, error: 'Påmindelsen findes ikke' }
  await audit(id, (data as Array<{ title: string }>)[0].title, 'snoozed', { reminder_at: next })
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function deletePersonalReminder(id: string): Promise<{ success: boolean; error?: string }> {
  validateUUID(id, 'påmindelse ID')
  const { supabase, userId } = await getAuthenticatedClient()
  const { data, error } = await supabase.from('personal_reminders').delete().eq('id', id).eq('owner_id', userId).select('id, title')
  if (error || !(data ?? []).length) return { success: false, error: 'Påmindelsen findes ikke' }
  await audit(id, (data as Array<{ title: string }>)[0].title, 'deleted')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}
