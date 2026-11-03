/**
 * Mandag–søndag for en dansk kalenderdato (YYYY-MM-DD).
 * Bruges til planlægningsbelastning. Ændrer ingen arbejdsordre.
 */
import { copenhagenDatePlusDays } from '@/lib/utils/copenhagen-time'

export function copenhagenWeekBounds(today: string): { start: string; end: string } {
  const [y, m, d] = today.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  const noon = new Date(`${today}T12:00:00Z`)
  return {
    start: copenhagenDatePlusDays(mondayOffset, noon),
    end: copenhagenDatePlusDays(mondayOffset + 6, noon),
  }
}
