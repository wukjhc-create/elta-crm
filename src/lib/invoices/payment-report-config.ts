/**
 * Sprint Ø5.0 — Konfiguration for planlagt betalingsrapport-mail.
 *
 * Isomorft (ingen server-imports). Gemmes som JSONB i
 * company_settings.payment_report_config. NULL → rapport slået fra.
 * Cost-free: kun modtagere + filtervalg.
 */

export type PaymentReportFilter = 'overdue' | 'outstanding' | 'both'

export interface PaymentReportConfig {
  enabled: boolean
  recipients: string[]
  filter: PaymentReportFilter
  skip_if_empty: boolean
}

export const DEFAULT_PAYMENT_REPORT_CONFIG: PaymentReportConfig = {
  enabled: false,
  recipients: [],
  filter: 'both',
  skip_if_empty: true,
}

const VALID_FILTERS = new Set<PaymentReportFilter>(['overdue', 'outstanding', 'both'])

/** Sikker parse af rå JSONB → config (ukendt input → standard slået fra). */
export function parsePaymentReportConfig(raw: unknown): PaymentReportConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PAYMENT_REPORT_CONFIG }
  const r = raw as Record<string, unknown>
  const recipients = Array.isArray(r.recipients)
    ? (r.recipients.filter((e) => typeof e === 'string' && e.includes('@')) as string[])
    : []
  const filter = (typeof r.filter === 'string' && VALID_FILTERS.has(r.filter as PaymentReportFilter)
    ? (r.filter as PaymentReportFilter)
    : 'both')
  return {
    enabled: r.enabled === true,
    recipients,
    filter,
    skip_if_empty: r.skip_if_empty !== false, // default true
  }
}

/**
 * "both" eksporteres som udestående (outstanding ⊇ forfaldne) — én liste.
 * overdue → kun forfaldne. Dokumenteret regel.
 */
export function reportFilterToExport(f: PaymentReportFilter): 'overdue' | 'outstanding' {
  return f === 'overdue' ? 'overdue' : 'outstanding'
}

export const REPORT_FILTER_LABEL: Record<PaymentReportFilter, string> = {
  overdue: 'forfaldne fakturaer',
  outstanding: 'udestående fakturaer',
  both: 'udestående (inkl. forfaldne)',
}
