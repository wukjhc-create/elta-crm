/**
 * Overskrift for en valgt kalenderdag. Datoen er en dansk kalenderdag, ikke servertid.
 */
import { copenhagenLocalToIso } from '@/lib/utils/copenhagen-time'

export function calendarDayHeading(selectedDate: string | null | undefined): string {
  if (!selectedDate) return 'Vælg en dag'
  return new Date(copenhagenLocalToIso(selectedDate, '12:00')).toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Copenhagen',
  })
}
