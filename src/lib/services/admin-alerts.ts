/**
 * Admin alert service.
 *
 * Sends alert emails to admins when critical system conditions occur.
 * De-duped via system_health_log lookups so we don't spam the inbox:
 * a given alert `key` cannot fire twice within `cooldownMinutes`.
 *
 * Recipients:
 *   1. process.env.ADMIN_ALERT_EMAIL (comma-separated) takes priority
 *   2. else: every profile.email where role='admin'
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { BRAND_COMPANY_NAME, BRAND_GREEN } from '@/lib/brand'

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
  const recipients = await resolveRecipients()
  if (recipients.length === 0) {
    await markAttempted(input, 'no_recipients')
    return { sent: false, reason: 'no_recipients' }
  }

  // Send via Microsoft Graph.
  try {
    const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
    if (!isGraphConfigured()) {
      await markAttempted(input, 'graph_not_configured')
      return { sent: false, reason: 'graph_not_configured' }
    }
    const html = renderAlertEmail(input)
    const result = await sendEmailViaGraph({
      to: recipients,
      subject: input.subject,
      html,
    })
    if (!result.success) {
      await markAttempted(input, `graph_failed:${result.error ?? 'unknown'}`)
      return { sent: false, reason: result.error ?? 'graph_failed' }
    }
    await markAttempted(input, 'sent', recipients)
    console.log('ADMIN ALERT SENT:', input.key, '→', recipients.join(', '))
    return { sent: true, recipients }
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
export async function scanAndAlert(): Promise<ScanReport> {
  const supabase = createAdminClient()
  const report: ScanReport = { alerts_sent: 0, alerts_skipped: 0, details: [] }

  const dispatch = async (key: string, severity: AlertSeverity, subject: string, body: string) => {
    const r = await sendAdminAlert({ key, severity, subject, body })
    if (r.sent) report.alerts_sent++
    else report.alerts_skipped++
    report.details.push({ key, sent: r.sent, reason: r.reason })
  }

  // 1. system_health_log error in last hour.
  try {
    const sinceHour = new Date(Date.now() - 60 * 60_000).toISOString()
    const { data: errs } = await supabase
      .from('system_health_log')
      .select('service, message, created_at')
      .eq('status', 'error')
      .gte('created_at', sinceHour)
      .order('created_at', { ascending: false })
      .limit(20)
    if (errs && errs.length > 0) {
      const sample = errs.slice(0, 5).map((r) => `[${r.service}] ${r.message ?? '(no message)'}`).join('\n')
      await dispatch(
        `system_errors`,
        'error',
        `[Elta CRM] ${errs.length} system-fejl i sidste time`,
        `${errs.length} fejl-rækker registreret i system_health_log.\n\nSeneste:\n${sample}`,
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
        '[Elta CRM] e-conomic er ikke konfigureret',
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
    if (failed && failed.length > 0) {
      const lines = failed.map((m) => `${m.mailbox}: ${m.last_sync_error ?? 'failed'}`).join('\n')
      await dispatch(
        'email_sync_failed',
        'error',
        `[Elta CRM] Email sync fejler (${failed.length} mailboxes)`,
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
        '[Elta CRM] Ingen bankposteringer importeret i 7 dage',
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

async function resolveRecipients(): Promise<string[]> {
  const fromEnv = (process.env.ADMIN_ALERT_EMAIL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromEnv.length > 0) return fromEnv

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('email')
    .eq('role', 'admin')
  return (data ?? [])
    .map((r) => (r.email as string | null) ?? '')
    .filter((e) => e.includes('@'))
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
      { ...input.metadata, recipients },
    )
  } catch { /* never crash */ }
}

function renderAlertEmail(input: AdminAlertInput): string {
  const tone = input.severity === 'error' ? '#b91c1c' : '#b45309'
  const safeBody = input.body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827">
  <div style="background:${BRAND_GREEN};padding:20px 28px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:18px">${escape(BRAND_COMPANY_NAME)} — System advarsel</h1>
  </div>
  <div style="padding:24px 28px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:14px;color:${tone};margin:0 0 12px"><strong>${escape(input.severity.toUpperCase())}</strong> · ${escape(input.key)}</p>
    <h2 style="margin:0 0 12px;font-size:16px">${escape(input.subject)}</h2>
    <div style="font-size:13px;color:#374151;line-height:1.5">${safeBody}</div>
    <p style="margin-top:24px;font-size:12px;color:#6b7280">Auto-genereret af Elta CRM monitoring.</p>
  </div>
</div>`.trim()
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
