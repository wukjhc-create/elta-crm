/**
 * Statistik ud fra hændelser CRM allerede har. Ingen Relatel-statistik-API.
 * Manglende varighed bliver null — ikke 0.
 */
import type { TelephonyEvent } from './types'

export interface TelephonyStats {
  total: number
  inbound: number
  outbound: number
  missed: number
  answered: number
  withVoicemail: number
  sms: number
  unknownDirection: number
  /** Sekunder. null når ingen hændelse har en varighed. */
  averageDurationSeconds: number | null
}

export function summarizeTelephony(events: TelephonyEvent[]): TelephonyStats {
  const durations = events.map((e) => e.durationSeconds).filter((n): n is number => typeof n === 'number' && n >= 0)
  return {
    total: events.length,
    inbound: events.filter((e) => e.direction === 'inbound').length,
    outbound: events.filter((e) => e.direction === 'outbound').length,
    missed: events.filter((e) => e.eventType === 'call.missed').length,
    answered: events.filter((e) => e.answered === true).length,
    withVoicemail: events.filter((e) => e.hasVoicemail || e.eventType === 'voicemail.created').length,
    sms: events.filter((e) => e.eventType === 'sms.received' || e.eventType === 'sms.sent').length,
    unknownDirection: events.filter((e) => e.direction == null && !e.eventType.startsWith('sms')).length,
    averageDurationSeconds: durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : null,
  }
}
