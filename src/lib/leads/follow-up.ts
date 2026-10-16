/**
 * X-11 (Henrik 2026-10-16): fælles opfølgning på leads (00233: follow_up_at / follow_up_owner / follow_up_note).
 * Ren logik — status afledes (intet statusfelt): ingen / planlagt / i dag / forfalden; vundne/tabte leads har aldrig
 * en aktiv opfølgning. Dansk kalenderdag (Europe/Copenhagen). Bevidst IKKE 'use server'.
 */
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export type FollowUpState = 'none' | 'planned' | 'today' | 'overdue'

export const FOLLOW_UP_LABEL: Record<Exclude<FollowUpState, 'none'>, string> = {
  planned: 'Opfølgning planlagt',
  today: 'Opfølg i dag',
  overdue: 'Opfølgning forfalden',
}

export function followUpState(lead: { status?: string | null; follow_up_at?: string | null }, now: Date = new Date()): FollowUpState {
  if (!lead.follow_up_at || lead.status === 'won' || lead.status === 'lost') return 'none'
  const at = new Date(lead.follow_up_at)
  if (Number.isNaN(at.getTime())) return 'none'
  if (at.getTime() < now.getTime()) return 'overdue'
  return copenhagenParts(at).date === copenhagenParts(now).date ? 'today' : 'planned'
}

/** Validerer input fra formularen (dato YYYY-MM-DD + klokkeslæt HH:MM i dansk tid; note ≤ 500) */
export function validateFollowUpInput(input: { date?: string | null; clock?: string | null; note?: string | null }): { ok: true; date: string; clock: string; note: string | null } | { ok: false; error: string } {
  const date = (input.date ?? '').trim()
  const clock = (input.clock ?? '').trim() || '09:00'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Vælg en dato for opfølgningen' }
  if (!/^\d{2}:\d{2}$/.test(clock)) return { ok: false, error: 'Ugyldigt klokkeslæt' }
  const note = (input.note ?? '').trim()
  if (note.length > 500) return { ok: false, error: 'Noten må højst være 500 tegn' }
  return { ok: true, date, clock, note: note || null }
}
