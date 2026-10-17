/**
 * Admin alert service.
 *
 * Sends alert emails to admins when critical system conditions occur.
 * De-duped via system_health_log lookups so we don't spam the inbox:
 * a given alert `key` cannot fire twice within `cooldownMinutes`.
 *
 * Recipients:
 *   1. process.env.ADMIN_ALERT_EMAIL (comma-separated) takes priority
 *   2. else: every ACTIVE profile with role admin or serviceleder (Henrik 2026-10-15)
 *
 * Politik (lib/alerts/alert-policy.ts): kun severity 'error' (kritisk) mailes. 'warning' går til
 * notifikationsklokken (system_alerts) + Pilot Health — ingen mail (før: 2–3 advarselsmails dagligt).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { BRAND_COMPANY_NAME, BRAND_GREEN } from '@/lib/brand'
import { escapeHtml, escapeHtmlWithLineBreaks } from '@/lib/utils/html-escape'
import { ALERT_RECIPIENT_ROLES, CRITICAL_ALERT_COOLDOWN_MIN, CRITICAL_SERVICES, criticalAlertSubject, isCriticalHealthEvent } from '@/lib/alerts/alert-policy'
import type { HealthService } from '@/types/system-health.types'

export type AlertSeverity = 'warning' | 'error'

export interface AdminAlertInput {
  /** Stable identifier — used for cooldown dedup. e.g. `email_sync_failed`. */
  key: string
  severity: AlertSeverity
  subject: string
  body: string
  cooldownMinutes?: number
  metadata?: Record<string, unknown>
}

export interface AdminAlertResult {
  sent: boolean
  reason?: string
  recipients?: string[]
}

const DEFAULT_COOLDOWN_MIN = 60

export async function sendAdminAlert(input: AdminAlertInput): Promise<AdminAlertResult> {
  const cooldown = input.cooldownMinutes ?? DEFAULT_COOLDOWN_MIN
  const supabase = createAdminClient()

  // Ikke-kritisk → klokken (én åben pr. nøgle), ingen mail
  if (input.severity !== 'error') {
    await raiseBellAlert(input, 'warning')
    await markAttempted(input, 'notification_only')
    return { sent: false, reason: 'notification_only' }
  }

  // Cooldown check via system_health_log entries tagged with our alert key.
  try {
    const since = new Date(Date.now() - cooldown * 60_000).toISOString()
    const { count } = await supabase
      .from('system_health_log')
      .select('id', { count: 'exact', head: true })
      .eq('service', 'health_check')
      .gte('created_at', since)
      .like('message', `admin_alert:${input.key}%`)
    if ((count ?? 0) > 0) {
      return { sent: false, reason: `cooldown ${cooldown}min` }
    }
  } catch {
    /* ignore — we'd rather err on the side of sending */
  }

  // Resolve recipients.
  const recipients = await resolveAlertRecipients()
  if (recipients.length === 0) {
    await markAttempted(input, 'no_recipients')
    return { sent: false, reason: 'no_recipients' }
  }

  // Send via Microsoft Graph + central mail-router (Sprint 8H Phase 3).
  // Hver admin-recipient routes som internal_notification saa @eltasolar.dk
  // ikke blokeres af extern-guard, og hver send faar sin egen audit-trail.
  try {
    const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
    if (!isGraphConfigured()) {
      await markAttempted(input, 'graph_not_configured')
      return { sent: false, reason: 'graph_not_configured' }
    }
    const { resolveInternalNotificationRoute, logMailRoute } = await import(
      '@/lib/actions/mail-route-resolvers'
    )
    const html = renderAlertEmail(input)

    const sentRecipients: string[] = []
    let lastError: string | undefined
    for (const recipient of recipients) {
      const routeResult = await resolveInternalNotificationRoute({
        recipientEmail: recipient,
        contextLabel: `admin_alert:${input.key}`,
      })
      if (!routeResult.ok || !routeResult.route) {
        lastError = routeResult.error || 'route_failed'
        continue
      }
      const route = routeResult.route
      const sendResult = await sendEmailViaGraph({
        to: route.toEmail,
        subject: input.subject,
        html,
      })
      if (sendResult.success) {
        sentRecipients.push(route.toEmail)
        await logMailRoute(route, 'sent', { alert_key: input.key })
      } else {
        lastError = sendResult.error
        await logMailRoute(route, 'failed', {
          alert_key: input.key,
          error: sendResult.error,
        })
      }
    }

    if (sentRecipients.length === 0) {
      await markAttempted(input, `graph_failed:${lastError ?? 'unknown'}`)
      return { sent: false, reason: lastError ?? 'graph_failed' }
    }
    await markAttempted(input, 'sent', sentRecipients)
    console.log('ADMIN ALERT SENT:', input.key, '→', sentRecipients.join(', '))
    return { sent: true, recipients: sentRecipients }
  } catch (err) {
    logger.error('sendAdminAlert threw', { error: err instanceof Error ? err : new Error(String(err)) })
    await markAttempted(input, `threw:${err instanceof Error ? err.message : String(err)}`)
    return { sent: false, reason: err instanceof Error ? err.message : 'threw' }
  }
}

// =====================================================
// Cron-side: scan health log for fresh failures and alert
// =====================================================

export interface ScanReport {
  alerts_sent: number
  alerts_skipped: number
  details: Array<{ key: string; sent: boolean; reason?: string }>
}

/**
 * Walk the recent system signals and trigger alerts on the conditions
 * the spec calls out:
 *   - any system_health_log error in last hour
 *   - economic not configured
 *   - email sync last_status='failed'
 *   - bank: no rows in last 7 days (treated as warning, not error,
 *     unless the operator explicitly tagged it)
 */
/** Vindue for fejl-scanning = intervallet mellem to kørsler af system-health-check (dagligt). */
const SCAN_WINDOW_MS = 24 * 60 * 60_000

export async function scanAndAlert(): Promise<ScanReport> {
  const supabase = createAdminClient()
  const report: ScanReport = { alerts_sent: 0, alerts_skipped: 0, details: [] }

  const dispatch = async (key: string, severity: AlertSeverity, subject: string, body: string) => {
    const r = await sendAdminAlert({ key, severity, subject, body })
    if (r.sent) report.alerts_sent++
    else report.alerts_skipped++
    report.details.push({ key, sent: r.sent, reason: r.reason })
  }

  // 1. system_health_log errors siden sidste scanning. Cron-review 2026-10-09 (#2): scanningen kører én gang i døgnet
  // (09:00 UTC) — med 1-times vindue blev natlige fejl (supplier-sync, bank-match, rykkere …) aldrig mailet.
  try {
    const sinceHour = new Date(Date.now() - SCAN_WINDOW_MS).toISOString()
    // CR-3 (cron-review 2026-10-17): kun KRITISKE services hentes (før de 20 nyeste fejl af alle slags → "20+ kritiske"
    // selv om de fleste var health_check-rækker), og services der allerede har fået straks-alarmen i vinduet
    // springes over — én postkassefejl gav ellers straks-mail + "system-fejl"-mail + "email sync"-mail samme dag.
    const { data: errs } = await supabase
      .from('system_health_log')
      .select('service, message, created_at')
      .eq('status', 'error')
      .in('service', [...CRITICAL_SERVICES])
      .gte('created_at', sinceHour)
      .order('created_at', { ascending: false })
      .limit(SCAN_ROW_CAP)
    const alerted = await servicesAlertedSince(sinceHour)
    const critical = ((errs ?? []) as Array<{ service: string; message: string | null }>)
      .filter((r) => isCriticalHealthEvent(r.service as HealthService, 'error') && !alerted.has(r.service))
    if (critical.length > 0) {
      const sample = critical.slice(0, 5).map((r) => `[${r.service}] ${r.message ?? '(ingen besked)'}`).join('\n')
      const n = `${critical.length}${(errs?.length ?? 0) >= SCAN_ROW_CAP ? '+' : ''}`
      await dispatch(
        `system_errors`,
        'error',
        `[ELTA Drift] ${n} kritiske system-fejl det seneste døgn`,
        `${n} kritiske fejl-rækker registreret i system_health_log (services uden straks-alarm i perioden).\n\nSeneste:\n${sample}`,
      )
    }
  } catch (err) {
    logger.warn('scanAndAlert: system errors probe failed', { error: err })
  }

  // 2. e-conomic not configured (warning).
  try {
    const { data: ec } = await supabase
      .from('accounting_integration_settings')
      .select('active, api_token, agreement_grant_token')
      .eq('provider', 'economic')
      .maybeSingle()
    if (!ec || !ec.active || !ec.api_token || !ec.agreement_grant_token) {
      await dispatch(
        'economic_not_configured',
        'warning',
        '[ELTA Drift] e-conomic er ikke konfigureret',
        ec
          ? `Settings-row findes, men er ufuldstændig: active=${ec.active}, api_token=${!!ec.api_token}, grant_token=${!!ec.agreement_grant_token}`
          : 'Ingen accounting_integration_settings-row for provider="economic". Faktura-sync er deaktiveret.',
      )
    }
  } catch (err) {
    logger.warn('scanAndAlert: economic probe failed', { error: err })
  }

  // 3. email sync failure.
  try {
    const { data: failed } = await supabase
      .from('graph_sync_state')
      .select('mailbox, last_sync_status, last_sync_error, last_sync_at')
      .eq('last_sync_status', 'failed')
    // CR-3: straks-alarmen for mail er allerede sendt i døgnet → ingen ekstra mail om det samme
    if (failed && failed.length > 0 && !(await servicesAlertedSince(new Date(Date.now() - SCAN_WINDOW_MS).toISOString())).has('email')) {
      const lines = failed.map((m) => `${m.mailbox}: ${m.last_sync_error ?? 'failed'}`).join('\n')
      await dispatch(
        'email_sync_failed',
        'error',
        `[ELTA Drift] Email sync fejler (${failed.length} mailboxes)`,
        lines,
      )
    }
  } catch (err) {
    logger.warn('scanAndAlert: email sync probe failed', { error: err })
  }

  // 4. bank import inactive (>7 days).
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString().slice(0, 10)
    const { count } = await supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .gte('date', cutoff)
    if (!count || count === 0) {
      await dispatch(
        'bank_import_stale',
        'warning',
        '[ELTA Drift] Ingen bankposteringer importeret i 7 dage',
        'bank_transactions er tom for de sidste 7 dage. Tjek bank-importen.',
      )
    }
  } catch (err) {
    logger.warn('scanAndAlert: bank probe failed', { error: err })
  }

  return report
}

// =====================================================
// internals
// =====================================================

const SCAN_ROW_CAP = 500

/** CR-3: services hvis straks-alarm (critical:<service>) faktisk blev sendt siden `sinceIso` */
async function servicesAlertedSince(sinceIso: string): Promise<Set<string>> {
  try {
    const { data } = await createAdminClient()
      .from('system_health_log')
      .select('message')
      .eq('service', 'health_check')
      .like('message', 'admin_alert:critical:% sent')
      .gte('created_at', sinceIso)
      .limit(200)
    const out = new Set<string>()
    for (const r of (data ?? []) as Array<{ message: string | null }>) {
      const m = /^admin_alert:critical:([a-z_]+) sent$/.exec(r.message ?? '')
      if (m) out.add(m[1])
    }
    return out
  } catch {
    return new Set()
  }
}

/**
 * Kritisk fejl logget via logHealth → straks-mail til admin + serviceleder (højst én pr. service pr. time) og en
 * kritisk række i klokken. Kaldes kun for isCriticalHealthEvent; fejler aldrig kalderen.
 */
export async function alertCriticalHealthEvent(service: HealthService, message: string): Promise<void> {
  try {
    const input: AdminAlertInput = {
      key: `critical:${service}`,
      severity: 'error',
      subject: criticalAlertSubject(service),
      body: `${message.slice(0, 500)}\n\nSe Pilot Health for detaljer og efterfølgende fejl.`,
      cooldownMinutes: CRITICAL_ALERT_COOLDOWN_MIN,
      metadata: { service },
    }
    await raiseBellAlert(input, 'critical')
    await sendAdminAlert(input)
  } catch { /* never crash */ }
}

export async function resolveAlertRecipients(): Promise<string[]> {
  const fromEnv = (process.env.ADMIN_ALERT_EMAIL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromEnv.length > 0) return fromEnv

  // Login-e-mailen fra Auth — ikke profiles.email (kan være tom og kan ændres af brugeren selv)
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', [...ALERT_RECIPIENT_ROLES])
    .eq('is_active', true)
    .limit(25)
  const emails = await Promise.all(((data ?? []) as Array<{ id: string }>).map(async (p) => {
    const { data: u } = await supabase.auth.admin.getUserById(p.id)
    return (u?.user?.email ?? '').trim().toLowerCase()
  }))
  return Array.from(new Set(emails.filter((e) => e.includes('@'))))
}

/**
 * Notifikationsklokken: højst én åben (ikke afvist) række pr. alarmnøgle — ingen spam.
 * CR-4 (cron-review 2026-10-17): en åben (evt. læst) række skjulte senere fejl med samme nøgle (fx critical:cron for
 * en ANDEN cron). Ny forekomst opdaterer rækken: seneste besked, ulæst igen, antal + første/seneste tidspunkt.
 */
async function raiseBellAlert(input: AdminAlertInput, severity: 'warning' | 'critical'): Promise<void> {
  try {
    const supabase = createAdminClient()
    const alertType = `admin_alert:${input.key}`
    const { data: open } = await supabase
      .from('system_alerts')
      .select('id, details, created_at')
      .eq('alert_type', alertType)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (open) {
      const prev = ((open as { details?: Record<string, unknown> | null }).details ?? {}) as Record<string, unknown>
      const now = new Date().toISOString()
      await supabase.from('system_alerts').update({
        severity,
        title: input.subject.replace(/^\[ELTA Drift\]\s*/, ''),
        message: input.body.slice(0, 1000),
        is_read: false,
        read_at: null,
        created_at: now, // øverst i klokken (listen er de 20 nyeste)
        details: {
          ...prev,
          key: input.key,
          ...(input.metadata ?? {}),
          occurrences: (typeof prev.occurrences === 'number' ? prev.occurrences : 1) + 1,
          first_seen: typeof prev.first_seen === 'string' ? prev.first_seen : (open as { created_at: string }).created_at,
          last_seen: now,
        },
      }).eq('id', (open as { id: string }).id)
      return
    }
    await supabase.from('system_alerts').insert({
      alert_type: alertType,
      severity,
      title: input.subject.replace(/^\[ELTA Drift\]\s*/, ''),
      message: input.body.slice(0, 1000),
      details: { key: input.key, ...(input.metadata ?? {}) },
    })
  } catch { /* never crash */ }
}

async function markAttempted(
  input: AdminAlertInput,
  outcome: string,
  recipients?: string[]
): Promise<void> {
  try {
    const { logHealth } = await import('@/lib/services/system-health')
    await logHealth(
      'health_check',
      input.severity === 'error' ? 'error' : 'warning',
      `admin_alert:${input.key} ${outcome}`,
      // CR-11 (cron-review 2026-10-17): ingen modtager-adresser i helbredsloggen (persondata) — kun antal
      { ...input.metadata, ...(recipients ? { recipient_count: recipients.length } : {}) },
    )
  } catch { /* never crash */ }
}

function renderAlertEmail(input: AdminAlertInput): string {
  const tone = input.severity === 'error' ? '#b91c1c' : '#b45309'
  const safeBody = escapeHtmlWithLineBreaks(input.body)
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827">
  <div style="background:${BRAND_GREEN};padding:20px 28px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:18px">${escapeHtml(BRAND_COMPANY_NAME)} — System advarsel</h1>
  </div>
  <div style="padding:24px 28px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:14px;color:${tone};margin:0 0 12px"><strong>${escapeHtml(input.severity.toUpperCase())}</strong> · ${escapeHtml(input.key)}</p>
    <h2 style="margin:0 0 12px;font-size:16px">${escapeHtml(input.subject)}</h2>
    <div style="font-size:13px;color:#374151;line-height:1.5">${safeBody}</div>
    <p style="margin-top:24px;font-size:12px;color:#6b7280">Auto-genereret af ELTA Drift monitoring.</p>
  </div>
</div>`.trim()
}
