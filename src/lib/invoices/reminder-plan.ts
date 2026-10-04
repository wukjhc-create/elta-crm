/**
 * Rykkerregler for kundefakturaer (ren logik) — delt af invoice-reminders-cronen (services/invoices.ts) og
 * cockpittets "Forfaldne fakturaer" (N89), så visningen altid følger de regler cronen faktisk bruger.
 *   niveau 1: ≥ 3 dage over forfald (mail) · niveau 2: ≥ 10 dage (mail) · niveau 3: ≥ 20 dage (manuel gennemgang)
 *   mindst 5 dage mellem rykkere; et niveau gentages aldrig (reminder_count = sidst brugte niveau).
 */
export const REMINDER_RULES = [
  { level: 1 as const, minDaysOverdue: 3 },
  { level: 2 as const, minDaysOverdue: 10 },
  { level: 3 as const, minDaysOverdue: 20 },
]

export const MIN_DAYS_BETWEEN_REMINDERS = 5

export function pickReminderLevel(daysOverdue: number, currentCount: number): 1 | 2 | 3 | null {
  for (const rule of REMINDER_RULES) {
    if (rule.level <= currentCount) continue
    if (daysOverdue >= rule.minDaysOverdue) return rule.level
  }
  return null
}

export interface NextReminder {
  /** 'mail' = cronen sender rykker 1/2; 'manual' = niveau 3 (eskaleres til manuel gennemgang); 'done' = alle niveauer brugt */
  kind: 'mail' | 'manual' | 'done'
  level: 1 | 2 | 3 | null
  /** 0 = ved næste cron-kørsel; >0 = om så mange dage */
  inDays: number
}

/** Hvad sker der næste gang for en forfalden faktura (samme regler som cronen; inkl. pausen mellem rykkere). */
export function nextReminder(daysOverdue: number, currentCount: number, daysSinceLastReminder: number | null): NextReminder {
  const rule = REMINDER_RULES.find((r) => r.level > currentCount)
  if (!rule) return { kind: 'done', level: null, inDays: 0 }
  const untilDue = Math.max(0, rule.minDaysOverdue - daysOverdue)
  const untilCooldown = daysSinceLastReminder == null ? 0 : Math.max(0, MIN_DAYS_BETWEEN_REMINDERS - daysSinceLastReminder)
  return { kind: rule.level === 3 ? 'manual' : 'mail', level: rule.level, inDays: Math.max(untilDue, untilCooldown) }
}
