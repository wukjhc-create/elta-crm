/**
 * Sprint Ø6.5 — Daglig opsummerende mail om e-conomic eksportfejl.
 *
 * Genbruger:
 *  - computeAccountingHealthSummary (Ø6.4) til cost-free fejl-summary
 *  - Graph-mail-helperen (sendEmailViaGraph) — INGEN nyt mail-system
 *  - audit_logs-mønsteret fra Ø5.0
 *  - dedup-beslutning fra export-error-notification-config (anti-spam)
 *
 * Sender ALDRIG én mail pr. fejl — kun én samlet daglig opsummering, og kun
 * når der findes åbne fejl + dedup tillader det. Ingen secrets, cost-free.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { computeAccountingHealthSummary } from '@/lib/services/accounting-health'
import {
  parseExportErrorNotificationConfig,
  decideErrorNotification,
  type NotificationDecisionReason,
} from '@/lib/invoices/export-error-notification-config'

const FROM_MAILBOX = 'kontakt@eltasolar.dk'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app').replace(/\/$/, '')

export interface ExportErrorNotificationResult {
  status: 'sent' | 'skipped' | 'failed'
  reason?: NotificationDecisionReason | string
  failed_count: number
  recipients: number
}

function fmtDateTime(s: string): string {
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(s))
}

export async function sendExportErrorNotification(opts: {
  trigger: 'cron' | 'test'
}): Promise<ExportErrorNotificationResult> {
  const supabase = createAdminClient()

  const audit = async (action: string, description: string, metadata: Record<string, unknown>) => {
    try {
      await supabase.from('audit_logs').insert({
        user_id: null,
        entity_type: 'integration',
        entity_id: null,
        entity_name: 'e-conomic',
        action,
        action_description: description,
        changes: {},
        metadata: { provider: 'economic', trigger: opts.trigger, ...metadata },
      })
    } catch (e) {
      logger.error('export-error-notification: audit failed', { error: e })
    }
  }

  const { data: row } = await supabase
    .from('company_settings')
    .select('id, export_error_notification_config')
    .maybeSingle()
  const config = parseExportErrorNotificationConfig(row?.export_error_notification_config)
  const settingsId = row?.id as string | undefined

  const summary = await computeAccountingHealthSummary(supabase)
  const now = new Date()

  // Cron: respektér dedup/anti-spam. Test: send altid (uden at røre dedup-state).
  if (opts.trigger === 'cron') {
    const decision = decideErrorNotification(config, {
      integrationReady: summary.integration_ready,
      failedCount: summary.failed_count,
      now,
    })
    if (!decision.send) {
      await audit('accounting_export_error_notification_skipped',
        `Eksportfejl-notifikation sprunget over (${decision.reason})`,
        { reason: decision.reason, failed_count: summary.failed_count })
      return { status: 'skipped', reason: decision.reason, failed_count: summary.failed_count, recipients: config.recipients.length }
    }
  } else {
    // Test kræver mindst én modtager.
    if (config.recipients.length === 0) {
      return { status: 'failed', reason: 'no_recipients', failed_count: summary.failed_count, recipients: 0 }
    }
  }

  // Byg dansk mailtekst (cost-free — kun antal/fakturanr/dato/links).
  const isTest = opts.trigger === 'test'
  const subject = `${isTest ? '[TEST] ' : ''}e-conomic: ${summary.failed_count} eksportfejl kræver handling`
  const logUrl = `${APP_URL}/dashboard/settings/economic/log?status=failed`
  const settingsUrl = `${APP_URL}/dashboard/settings/economic`
  const le = summary.latest_error

  const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
  <div style="background:#b91c1c;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:20px">e-conomic eksportfejl</h1>
    <p style="color:#fee2e2;margin:6px 0 0;font-size:14px">${fmtDateTime(now.toISOString())}${isTest ? ' · testnotifikation' : ''}</p>
  </div>
  <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px;margin:0 0 12px">Hej bogholderi,</p>
    <p style="color:#374151;margin:0 0 16px">
      Der er <strong>${summary.failed_count}</strong> faktura(er) med fejlet eksport til e-conomic, som stadig kan udbedres.
    </p>
    ${le ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px;margin:0 0 16px">
      <p style="margin:0;color:#6b7280;font-size:13px">Seneste fejl${le.invoice_number ? ` · faktura ${le.invoice_number}` : ''} (${fmtDateTime(le.at)})</p>
      <p style="margin:4px 0 0;color:#b91c1c;font-weight:600">${le.message}</p>
    </div>` : ''}
    ${!summary.integration_ready ? `
    <p style="color:#b45309;margin:0 0 16px">
      Bemærk: e-conomic-integrationen er ikke fuldt opsat. <a href="${settingsUrl}" style="color:#b45309">Åbn opsætning</a>.
    </p>` : ''}
    <p style="margin:20px 0 0">
      <a href="${logUrl}" style="display:inline-block;background:#1f9d55;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Åbn eksport-log</a>
    </p>
    <p style="color:#6b7280;margin:24px 0 0;font-size:13px">
      Du modtager denne mail, fordi eksportfejl-notifikation er slået til. Det er en samlet daglig opsummering — ikke én mail pr. fejl.
    </p>
    <p style="color:#9ca3af;margin:6px 0 0;font-size:12px">Automatisk besked fra ELTA Drift</p>
  </div>
</div>`.trim()

  const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  if (!isGraphConfigured()) {
    await audit('accounting_export_error_notification_skipped', 'Eksportfejl-notifikation ikke sendt — mail er ikke opsat',
      { reason: 'graph_not_configured', failed_count: summary.failed_count })
    return { status: 'failed', reason: 'graph_not_configured', failed_count: summary.failed_count, recipients: config.recipients.length }
  }

  const sendRes = await sendEmailViaGraph({
    to: config.recipients,
    subject,
    html,
    fromMailbox: FROM_MAILBOX,
  })

  if (!sendRes.success) {
    await audit('accounting_export_error_notification_skipped', `Eksportfejl-notifikation fejlede: ${sendRes.error ?? 'ukendt'}`,
      { reason: 'send_failed', failed_count: summary.failed_count })
    return { status: 'failed', reason: sendRes.error ?? 'send_failed', failed_count: summary.failed_count, recipients: config.recipients.length }
  }

  if (isTest) {
    await audit('accounting_export_error_notification_test_sent',
      `Test-notifikation sendt til ${config.recipients.length} modtager(e) — ${summary.failed_count} fejl`,
      { failed_count: summary.failed_count, recipient_count: config.recipients.length })
    return { status: 'sent', failed_count: summary.failed_count, recipients: config.recipients.length }
  }

  // Opdatér dedup-tilstand (KUN rigtig cron) — bevar config-felterne.
  if (settingsId) {
    try {
      await supabase
        .from('company_settings')
        .update({
          export_error_notification_config: {
            enabled: config.enabled,
            recipients: config.recipients,
            min_hours_between: config.min_hours_between,
            last_notified_at: now.toISOString(),
            last_notified_count: summary.failed_count,
          },
        })
        .eq('id', settingsId)
    } catch (e) {
      logger.error('export-error-notification: dedup-state update failed', { error: e })
    }
  }

  await audit('accounting_export_error_notification_sent',
    `Eksportfejl-notifikation sendt til ${config.recipients.length} modtager(e) — ${summary.failed_count} fejl`,
    { failed_count: summary.failed_count, recipient_count: config.recipients.length })

  return { status: 'sent', failed_count: summary.failed_count, recipients: config.recipients.length }
}
