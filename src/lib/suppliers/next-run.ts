/**
 * TZ-7 (tidszone-review 2026-10-18): "næste kørsel" for leverandørsynk. Planernes cron-tid er dansk tid
 * (supplier_sync_schedules.timezone = 'Europe/Copenhagen'), men blev sat med setHours i serverens UTC → vist 1–2 t
 * forkert. Feltet er kun visning (cron-ruten kører alle aktive planer). Én fælles beregning for action + cron-rute.
 * Understøtter "min time * * *" (daglig); andet/ugyldigt → kl. 03:00 dansk tid.
 */
import { copenhagenDatePlusDays, copenhagenLocalToIso, copenhagenParts } from '@/lib/utils/copenhagen-time'

export function nextDailyRunIso(cronExpression: string | null | undefined, now: Date = new Date()): string {
  const parts = String(cronExpression ?? '').trim().split(/\s+/)
  let hour = 3
  let minute = 0
  if (parts.length === 5) {
    const m = parts[0] === '*' ? 0 : Number(parts[0])
    const h = parts[1] === '*' ? 0 : Number(parts[1])
    if (Number.isInteger(m) && m >= 0 && m <= 59 && Number.isInteger(h) && h >= 0 && h <= 23) {
      hour = h
      minute = m
    }
  }
  const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const today = copenhagenParts(now).date
  const candidate = copenhagenLocalToIso(today, clock)
  if (Date.parse(candidate) > now.getTime()) return candidate
  return copenhagenLocalToIso(copenhagenDatePlusDays(1, now), clock)
}
