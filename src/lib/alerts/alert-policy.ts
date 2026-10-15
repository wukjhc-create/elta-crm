/**
 * Alarm-politik (Henrik 2026-10-15, pilot):
 *   - KRITISK (fejl i penge-/kundekommunikations-/driftsflows) → mail straks til admin + serviceleder (cooldown pr. service)
 *   - ikke-kritisk (advarsler, brugerfejl i UI, AI/auto-flows) → Pilot Health + notifikationsklokken, ingen mail
 *   - daglig digest kommer senere; ingen alarm-spam
 * Ren modul (ingen I/O) — bruges af logHealth og admin-alerts.
 */
import type { HealthService, HealthStatus } from '@/types/system-health.types'

/** Fejl her rammer fakturering, betalinger, bogføring, udgående mail eller planlagte kørsler */
export const CRITICAL_SERVICES: readonly HealthService[] = ['invoice', 'bank', 'economic', 'email', 'cron']

export const ALERT_RECIPIENT_ROLES = ['admin', 'serviceleder'] as const

/** Højst én straks-mail pr. service pr. time; efterfølgende fejl ses i Pilot Health */
export const CRITICAL_ALERT_COOLDOWN_MIN = 60

export function isCriticalHealthEvent(service: HealthService, status: HealthStatus): boolean {
  return status === 'error' && CRITICAL_SERVICES.includes(service)
}

const LABEL: Partial<Record<HealthService, string>> = {
  invoice: 'Fakturering', bank: 'Bank/betalinger', economic: 'e-conomic', email: 'Mail', cron: 'Planlagt kørsel',
}

export function criticalAlertSubject(service: HealthService): string {
  return `[ELTA Drift] Kritisk fejl: ${LABEL[service] ?? service}`
}
