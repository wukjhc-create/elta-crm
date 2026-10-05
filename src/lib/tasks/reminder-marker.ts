/**
 * Markering af "påmindelse sendt" i en opgavebeskrivelse (ren logik). Bevidst IKKE 'use server'.
 *
 * Kommunikations-review 2026-10-04: besigtigelses-rykkeren (cron offer-reminders) ERSTATTEDE almindelig tekst
 * (adresse, noter) med {"reminder_sent":…} — prod: 5 opgaver mistede beskrivelsen. Nu bevares teksten og markøren
 * tilføjes på en ny linje; JSON-beskrivelser beholder deres felter og får nøglen reminder_sent.
 */
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export const REMINDER_MARK = '[Påmindelse om bekræftelse sendt'

function asJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function reminderAlreadySent(description: string | null | undefined): boolean {
  const raw = String(description ?? '')
  return !!asJsonObject(raw)?.reminder_sent || raw.includes(REMINDER_MARK)
}

export function markReminderSent(description: string | null | undefined, now: Date = new Date()): string {
  const raw = String(description ?? '')
  const json = asJsonObject(raw)
  if (json) return JSON.stringify({ ...json, reminder_sent: now.toISOString() })
  return [raw, `${REMINDER_MARK} ${copenhagenParts(now).date}]`].filter(Boolean).join('\n')
}
