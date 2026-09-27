/**
 * Cron-register (P1 #9 discovery) — én sandhed om hvad hver planlagt cron goer, bruges af Pilot Health (#10).
 *
 * Kilde: kodeanalyse af src/app/api/cron/* + read-only prod-maaling (scripts/prod-cron-discovery.ts), 2026-09-27.
 * Planerne staar i vercel.json (tidspunkter i UTC). `knownIssue` er et bevidst dokumenteret fund, der IKKE
 * er rettet, fordi en rettelse ville aktivere adfaerd i prod (kraever Henriks beslutning).
 */

export type CronExternalEffect = 'none' | 'customer_mail' | 'internal_mail' | 'supplier_api' | 'mail_read'

export interface CronInfo {
  name: string
  schedule: string
  purpose: string
  external: CronExternalEffect
  /** Hvordan cron'en slaas fra (flag/indstilling), eller null hvis der ikke findes en kontakt. */
  gate: string | null
  /** Kendt fund der ikke er rettet (se docs/pilot/CRON_DISCOVERY.md). */
  knownIssue?: string
}

export const CRON_REGISTRY: CronInfo[] = [
  { name: 'supplier-sync', schedule: '0 2 * * *', purpose: 'Leverandør-prissync efter planer', external: 'supplier_api', gate: 'supplier_sync_schedules.is_enabled (0 planer i prod)',
    knownIssue: 'P-003: bruger anon-klient → læser 0 planer/credentials og logger intet. Ingen effekt i dag (0 planer).' },
  { name: 'intelligence-check', schedule: '0 3 * * *', purpose: 'Prisadvarsler → system_alerts', external: 'none', gate: null },
  { name: 'lemu-sync', schedule: '0 4 * * 1', purpose: 'Lemvigh-Müller FTP-prisfil (ugentlig)', external: 'supplier_api', gate: 'LM-leverandør + credentials skal findes',
    knownIssue: 'Fejl (exception) skrives ikke til supplier_sync_logs — nu synlig via cron-log.' },
  { name: 'learning-feedback', schedule: '0 4 * * *', purpose: 'Kalkulations-feedback/kalibrering', external: 'none', gate: null,
    knownIssue: 'Bruger anon-klient → behandler 0 rækker (stille no-op).' },
  { name: 'email-sync', schedule: '0 5 * * *', purpose: 'Hent mails fra Microsoft Graph', external: 'mail_read', gate: 'AUTO_CREATE_CASES_ENABLED (OFF) styrer auto-sager',
    knownIssue: 'Kobling mail→kunde (linkEmail) bruger anon-klient → formentlig stille no-op.' },
  { name: 'offer-reminders', schedule: '0 8 * * *', purpose: 'Rykker-mail til kunder på ubesvarede tilbud', external: 'customer_mail', gate: 'company_settings.reminder_enabled (TIL i prod; 0 sendt seneste 30 dage)' },
  { name: 'invoice-reminders', schedule: '0 7 * * *', purpose: 'Betalingsrykker-mail til kunder', external: 'customer_mail', gate: null,
    knownIssue: 'Ingen on/off-kontakt. I prod: 0 sendt; samme faktura springes over dagligt siden 2026-07-10.' },
  { name: 'bank-match', schedule: '30 6 * * *', purpose: 'Match bankposteringer til fakturaer', external: 'none', gate: null },
  { name: 'payment-report', schedule: '30 7 * * *', purpose: 'Intern betalingsrapport-mail', external: 'internal_mail', gate: 'payment_report_config.enabled' },
  { name: 'export-error-notification', schedule: '15 8 * * *', purpose: 'Intern mail om fejlede e-conomic-eksporter', external: 'internal_mail', gate: 'export_error_notification_config.enabled' },
  { name: 'system-health-check', schedule: '0 9 * * *', purpose: 'Sundhedstjek + admin-alarm', external: 'internal_mail', gate: 'cooldown' },
  { name: 'incoming-invoices', schedule: '15 9 * * *', purpose: 'Indlæs leverandørfakturaer fra mail', external: 'none', gate: null },
  { name: 'incoming-invoices-api', schedule: '30 9 * * *', purpose: 'Hent leverandørfakturaer via AO/LM-API', external: 'supplier_api', gate: 'leverandør + credentials skal findes' },
  { name: 'unanswered-mails-check', schedule: '0 12 * * *', purpose: 'Opgaver for ubesvarede mails', external: 'none', gate: null,
    knownIssue: 'Bruger anon-klient → tjekker 0 mails, opretter 0 opgaver (stille no-op).' },
  { name: 'email-intelligence-summary', schedule: '30 0 * * *', purpose: 'Daglig mail-intelligens-opsummering', external: 'none', gate: null },
]
