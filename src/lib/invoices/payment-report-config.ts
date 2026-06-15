/**
 * Sprint Ø5.0 — Konfiguration for planlagt betalingsrapport-mail.
 *
 * Isomorft (ingen server-imports). Gemmes som JSONB i
 * company_settings.payment_report_config. NULL → rapport slået fra.
 * Cost-free: kun modtagere + filtervalg.
 */

export type PaymentReportFilter = 'overdue' | 'outstanding' | 'both'
export type PaymentReportFrequency = 'weekly' | 'biweekly' | 'monthly'
export type PaymentReportFormat = 'csv' | 'pdf' | 'both'

export interface PaymentReportConfig {
  enabled: boolean
  recipients: string[]
  filter: PaymentReportFilter
  skip_if_empty: boolean
  /** Sprint Ø5.1 — hvor ofte rapporten sendes. */
  frequency: PaymentReportFrequency
  /** ISO-ugedag 1=mandag … 7=søndag (gælder weekly/biweekly + "første X i måneden"). */
  weekday: number
  /** Sprint Ø5.2 — rapportformat: CSV til Excel, PDF til overblik. */
  format: PaymentReportFormat
}

export const DEFAULT_PAYMENT_REPORT_CONFIG: PaymentReportConfig = {
  enabled: false,
  recipients: [],
  filter: 'both',
  skip_if_empty: true,
  frequency: 'weekly',
  weekday: 1,
  format: 'csv',
}

const VALID_FILTERS = new Set<PaymentReportFilter>(['overdue', 'outstanding', 'both'])
const VALID_FREQ = new Set<PaymentReportFrequency>(['weekly', 'biweekly', 'monthly'])
const VALID_FORMAT = new Set<PaymentReportFormat>(['csv', 'pdf', 'both'])

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
  const frequency = (typeof r.frequency === 'string' && VALID_FREQ.has(r.frequency as PaymentReportFrequency)
    ? (r.frequency as PaymentReportFrequency)
    : 'weekly')
  const wd = Number(r.weekday)
  const weekday = Number.isInteger(wd) && wd >= 1 && wd <= 7 ? wd : 1
  const format = (typeof r.format === 'string' && VALID_FORMAT.has(r.format as PaymentReportFormat)
    ? (r.format as PaymentReportFormat)
    : 'csv')
  return {
    enabled: r.enabled === true,
    recipients,
    filter,
    skip_if_empty: r.skip_if_empty !== false, // default true
    frequency,
    weekday,
    format,
  }
}

export const FORMAT_LABEL: Record<PaymentReportFormat, string> = {
  csv: 'CSV (Excel)',
  pdf: 'PDF (overblik)',
  both: 'CSV + PDF',
}

export const WEEKDAY_LABEL: Record<number, string> = {
  1: 'Mandag', 2: 'Tirsdag', 3: 'Onsdag', 4: 'Torsdag', 5: 'Fredag', 6: 'Lørdag', 7: 'Søndag',
}
export const FREQUENCY_LABEL: Record<PaymentReportFrequency, string> = {
  weekly: 'Ugentlig',
  biweekly: 'Hver 14. dag',
  monthly: 'Månedlig',
}

/** JS getDay() (0=søndag) → ISO ugedag (1=mandag … 7=søndag). */
function jsDayToIso(d: number): number {
  return d === 0 ? 7 : d
}

/** ISO-ugenummer (til hver-14.-dag-paritet). */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Beslutter om rapporten skal sendes på den givne dato — bruges af cronen
 * (kører dagligt og vurderer selv). Pure → unit-testbar.
 *   weekly   : på valgt ugedag
 *   biweekly : på valgt ugedag i lige ISO-uger
 *   monthly  : på første forekomst af valgt ugedag i måneden (dato ≤ 7)
 */
export function shouldSendReportToday(config: PaymentReportConfig, now: Date): boolean {
  if (!config.enabled) return false
  if (jsDayToIso(now.getDay()) !== config.weekday) return false
  if (config.frequency === 'weekly') return true
  if (config.frequency === 'biweekly') return isoWeek(now) % 2 === 0
  return now.getDate() <= 7 // monthly — første valgte ugedag i måneden
}

/** Næste planlagte kørsel fra (og med) `from` — eller null hvis slået fra. */
export function nextScheduledRun(config: PaymentReportConfig, from: Date): Date | null {
  if (!config.enabled) return null
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let i = 0; i < 400; i++) {
    if (shouldSendReportToday(config, d)) return d
    d.setDate(d.getDate() + 1)
  }
  return null
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

/** Menneskelige danske labels til rapport-historik (ingen rå eventnavne i UI). */
export const REPORT_EVENT_LABEL: Record<string, string> = {
  payment_report_sent: 'Rapport sendt',
  payment_report_test_sent: 'Testrapport sendt',
  payment_report_skipped: 'Rapport sprunget over',
  payment_report_config_updated: 'Indstillinger ændret',
}

export const REPORT_SKIP_REASON_LABEL: Record<string, string> = {
  no_recipients: 'Ingen modtagere angivet',
  no_rows: 'Ingen kunder at følge op på',
  graph_not_configured: 'Mailafsendelse er ikke opsat',
  send_failed: 'Mailen kunne ikke sendes',
  data_error: 'Kunne ikke hente betalingsdata',
}
