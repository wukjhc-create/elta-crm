/**
 * Samme vindue som findDueAssistantReminders: auto_rule i assistent-reglerne,
 * ikke udført, og reminder_at inden for de seneste catchup-minutter.
 * reminder_at null er aldrig forfalden — opkaldskortets kø bruger det.
 */
import { ASSISTANT_RULES } from './rules'

export const REMINDER_CATCHUP_MIN = 60

export function isDueAssistantReminder(
  row: { auto_rule: string | null; status: string; reminder_at: string | null },
  now: Date,
  catchupMin = REMINDER_CATCHUP_MIN,
): boolean {
  if (row.status === 'done' || !row.reminder_at) return false
  if (!ASSISTANT_RULES.includes(row.auto_rule ?? '')) return false
  const at = Date.parse(row.reminder_at)
  if (Number.isNaN(at)) return false
  return at <= now.getTime() && at >= now.getTime() - catchupMin * 60_000
}
