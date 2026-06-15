/**
 * Sprint Ø6.5 — Konfiguration + anti-spam-dedup for e-conomic eksportfejl-
 * notifikation.
 *
 * Isomorft (ingen server-imports). Gemmes som JSONB i
 * company_settings.export_error_notification_config. NULL → slået fra.
 * Cost-free: kun modtagere + dedup-tællere. INGEN secrets.
 */

export interface ExportErrorNotificationConfig {
  enabled: boolean
  recipients: string[]
  /** Anti-spam: minimum antal timer mellem to notifikationer (når antal er uændret). */
  min_hours_between: number
  /** Dedup-tilstand (sat af cron, ikke af UI). */
  last_notified_at: string | null
  last_notified_count: number | null
}

export const DEFAULT_EXPORT_ERROR_NOTIFICATION_CONFIG: ExportErrorNotificationConfig = {
  enabled: false,
  recipients: [],
  min_hours_between: 20,
  last_notified_at: null,
  last_notified_count: null,
}

/** Sikker parse af rå JSONB → config (ukendt input → standard slået fra). */
export function parseExportErrorNotificationConfig(raw: unknown): ExportErrorNotificationConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_EXPORT_ERROR_NOTIFICATION_CONFIG }
  const r = raw as Record<string, unknown>
  const recipients = Array.isArray(r.recipients)
    ? (r.recipients.filter((e) => typeof e === 'string' && e.includes('@')) as string[])
    : []
  const mh = Number(r.min_hours_between)
  const min_hours_between = Number.isFinite(mh) && mh >= 1 && mh <= 168 ? Math.round(mh) : 20
  const lc = Number(r.last_notified_count)
  return {
    enabled: r.enabled === true,
    recipients,
    min_hours_between,
    last_notified_at: typeof r.last_notified_at === 'string' ? r.last_notified_at : null,
    last_notified_count: Number.isFinite(lc) ? lc : null,
  }
}

export type NotificationDecisionReason =
  | 'disabled'
  | 'no_recipients'
  | 'not_configured'
  | 'no_errors'
  | 'deduped'
  | 'send'

/**
 * Ren anti-spam-beslutning. Sender KUN hvis:
 *  - notifikation er slået til + har modtagere
 *  - integrationen er opsat (ellers ingen eksportfejl-mail)
 *  - der findes åbne fejl (failedCount > 0)
 *  - OG (aldrig sendt før ELLER antallet er ændret ELLER sidste mail er
 *    ældre end min_hours_between) → max én mail pr. dag ved uændret antal.
 */
export function decideErrorNotification(
  config: ExportErrorNotificationConfig,
  input: { integrationReady: boolean; failedCount: number; now: Date }
): { send: boolean; reason: NotificationDecisionReason } {
  if (!config.enabled) return { send: false, reason: 'disabled' }
  if (config.recipients.length === 0) return { send: false, reason: 'no_recipients' }
  if (!input.integrationReady) return { send: false, reason: 'not_configured' }
  if (input.failedCount <= 0) return { send: false, reason: 'no_errors' }

  // Aldrig sendt før → send.
  if (!config.last_notified_at) return { send: true, reason: 'send' }

  // Antal ændret siden sidst → send (ny information).
  if (config.last_notified_count !== input.failedCount) return { send: true, reason: 'send' }

  // Samme antal: kun hvis der er gået mindst min_hours_between timer.
  const elapsedMs = input.now.getTime() - new Date(config.last_notified_at).getTime()
  const thresholdMs = config.min_hours_between * 3600_000
  if (elapsedMs >= thresholdMs) return { send: true, reason: 'send' }

  return { send: false, reason: 'deduped' }
}
