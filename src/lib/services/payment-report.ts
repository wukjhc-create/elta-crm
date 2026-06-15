/**
 * Sprint Ø5.0 — Planlagt betalingsrapport-mail til bogholderiet.
 *
 * Genbruger Ø4.9-viewet (v_customers_with_payment_summary), Ø4.8-CSV-
 * helperen og Graph-mail-helperen. Ingen nyt mail-/rapportsystem.
 * Cost-free: kun kontaktinfo + salgs/faktura-data — ingen kost/margin/DB.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { generateCsv } from '@/lib/utils/csv-export'
import { PAYMENT_EXPORT_COLUMNS } from '@/lib/invoices/payment-export-columns'
import {
  reportFilterToExport,
  REPORT_FILTER_LABEL,
  type PaymentReportFilter,
} from '@/lib/invoices/payment-report-config'
import type { PaymentExportRow } from '@/lib/actions/invoices'

const EXPORT_LABEL: Record<string, string> = {
  late_payer: 'Ofte forsinket',
  on_time: 'Betaler til tiden',
  no_data: 'Ingen betalingshistorik',
}

type ExportFilter = 'overdue' | 'outstanding' | 'late_payer' | 'on_time' | 'no_data' | 'all'

/**
 * Cost-free byggeklods: hent betalingsopfølgningsrækker fra SQL-viewet.
 * Genbruges af både CSV-eksport-actionen og rapport-mailen. Ingen N+1,
 * ingen limit 20000 (viewet er forud-aggregeret).
 */
export async function buildPaymentExportRows(
  supabase: SupabaseClient,
  filter: ExportFilter
): Promise<{ rows: PaymentExportRow[]; error: string | null }> {
  let q = supabase
    .from('v_customers_with_payment_summary')
    .select(
      'id, company_name, contact_person, email, phone, is_active, outstanding_total, overdue_total, overdue_count, payment_status, average_days_late, latest_invoice_at, latest_paid_at'
    )
    .order('outstanding_total', { ascending: false })
    .limit(50000)
  if (filter === 'overdue') q = q.gt('overdue_count', 0)
  else if (filter === 'outstanding' || filter === 'all') q = q.gt('outstanding_total', 0)
  else if (filter === 'late_payer') q = q.eq('payment_status', 'late_payer')
  else if (filter === 'on_time') q = q.eq('payment_status', 'on_time')
  else if (filter === 'no_data') q = q.eq('payment_status', 'no_data')

  const { data, error } = await q
  if (error) {
    logger.error('buildPaymentExportRows: view query failed', { error })
    return { rows: [], error: 'Kunne ikke hente betalingsdata' }
  }

  const rows: PaymentExportRow[] = (data ?? []).map((c) => {
    const name = (c.company_name as string | null) || (c.contact_person as string | null) || '—'
    const status = (c.payment_status as string | null) ?? 'no_data'
    const overdueCount = Number(c.overdue_count ?? 0)
    const label =
      status === 'requires_attention'
        ? `${overdueCount} forfalden${overdueCount === 1 ? '' : 'e'} faktura${overdueCount === 1 ? '' : 'er'}`
        : EXPORT_LABEL[status] ?? 'Ingen betalingshistorik'
    return {
      customer_name: name,
      contact_person: (c.contact_person as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      active: (c.is_active as boolean | null) ?? null,
      outstanding_total: Number(c.outstanding_total ?? 0),
      overdue_total: Number(c.overdue_total ?? 0),
      overdue_count: overdueCount,
      payment_label: label,
      average_days_late:
        c.average_days_late === null || c.average_days_late === undefined ? null : Number(c.average_days_late),
      last_invoice_at: (c.latest_invoice_at as string | null) ?? null,
      last_payment_at: (c.latest_paid_at as string | null) ?? null,
      customer_url: `/dashboard/customers/${c.id}`,
      invoices_url: `/dashboard/invoices?q=${encodeURIComponent(name)}`,
    }
  })
  return { rows, error: null }
}

const REPORT_FROM_MAILBOX = 'kontakt@eltasolar.dk'

export type PaymentReportStatus = 'sent' | 'skipped' | 'failed' | 'no_recipients'

export interface SendPaymentReportResult {
  status: PaymentReportStatus
  row_count: number
  recipients: string[]
  reason?: string
}

function kr(n: number): string {
  return n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr.'
}

/**
 * Byg + send betalingsrapporten. Best-effort audit. Vælter aldrig på
 * audit-fejl. Skip hvis 0 rækker (og skip_if_empty) → ingen spam-mail.
 */
export async function sendPaymentReport(opts: {
  trigger: 'cron' | 'test'
  recipients: string[]
  filter: PaymentReportFilter
  skipIfEmpty: boolean
  actorUserId?: string | null
}): Promise<SendPaymentReportResult> {
  const supabase = createAdminClient()
  const recipients = Array.from(new Set(opts.recipients.map((r) => r.trim()).filter((r) => r.includes('@'))))

  const audit = async (action: string, description: string, metadata: Record<string, unknown>) => {
    try {
      await supabase.from('audit_logs').insert({
        user_id: opts.actorUserId ?? null,
        entity_type: 'export',
        entity_id: null,
        entity_name: 'Betalingsrapport',
        action,
        action_description: description,
        changes: {},
        metadata: { ...metadata, trigger: opts.trigger },
      })
    } catch (e) {
      logger.error('sendPaymentReport: audit failed', { error: e })
    }
  }

  if (recipients.length === 0) {
    await audit('payment_report_skipped', 'Betalingsrapport sprunget over — ingen modtagere', {
      reason: 'no_recipients',
      filter: opts.filter,
    })
    return { status: 'no_recipients', row_count: 0, recipients: [] }
  }

  const exportFilter = reportFilterToExport(opts.filter)
  const { rows, error } = await buildPaymentExportRows(supabase, exportFilter)
  if (error) {
    await audit('payment_report_skipped', `Betalingsrapport fejlede ved datahentning: ${error}`, {
      reason: 'data_error',
      filter: opts.filter,
    })
    return { status: 'failed', row_count: 0, recipients, reason: error }
  }

  if (rows.length === 0 && opts.skipIfEmpty) {
    await audit('payment_report_skipped', 'Betalingsrapport sprunget over — ingen kunder at følge op på', {
      reason: 'no_rows',
      filter: opts.filter,
      row_count: 0,
    })
    return { status: 'skipped', row_count: 0, recipients, reason: 'no_rows' }
  }

  // CSV (semikolon, UTF-8 BOM, escaping) — genbrug af Ø4.8-helper.
  const csv = generateCsv(rows, PAYMENT_EXPORT_COLUMNS)
  const today = new Date()
  const dateIso = today.toISOString().slice(0, 10)
  const dateDk = today.toLocaleDateString('da-DK', { day: '2-digit', month: 'long', year: 'numeric' })

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding_total, 0)
  const totalOverdue = rows.reduce((s, r) => s + r.overdue_total, 0)
  const overdueCustomers = rows.filter((r) => r.overdue_count > 0).length

  const subjectPrefix = opts.trigger === 'test' ? '[TEST] ' : ''
  const subject = `${subjectPrefix}Betalingsopfølgning — ELTA Drift (${dateDk})`

  const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827">
  <div style="background:#1f9d55;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:20px">Betalingsopfølgning</h1>
    <p style="color:#e8f5e8;margin:6px 0 0;font-size:14px">${dateDk}${opts.trigger === 'test' ? ' · testrapport' : ''}</p>
  </div>
  <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px;margin:0 0 12px">Hej bogholderi,</p>
    <p style="color:#374151;margin:0 0 16px">
      Her er den aktuelle betalingsopfølgningsliste (${REPORT_FILTER_LABEL[opts.filter]}). Den fulde liste er vedhæftet som CSV.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280">Kunder på listen</td><td style="padding:6px 0;color:#111827"><strong>${rows.length}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Kunder med forfaldne fakturaer</td><td style="padding:6px 0;color:#111827"><strong>${overdueCustomers}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Udestående i alt</td><td style="padding:6px 0;color:#111827"><strong>${kr(totalOutstanding)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Forfalden total</td><td style="padding:6px 0;color:#111827"><strong>${kr(totalOverdue)}</strong></td></tr>
    </table>
    <p style="color:#374151;margin:16px 0 0">
      Beløb er fakturabeløb inkl. moms. Åbn de enkelte kunder i ELTA Drift for at følge op.
    </p>
    <p style="color:#6b7280;margin:24px 0 0;font-size:13px">Automatisk rapport fra ELTA Drift</p>
  </div>
</div>`.trim()

  const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  if (!isGraphConfigured()) {
    await audit('payment_report_skipped', 'Betalingsrapport ikke sendt — mail er ikke opsat', {
      reason: 'graph_not_configured',
      filter: opts.filter,
      row_count: rows.length,
    })
    return { status: 'failed', row_count: rows.length, recipients, reason: 'graph_not_configured' }
  }

  const result = await sendEmailViaGraph({
    to: recipients,
    subject,
    html,
    fromMailbox: REPORT_FROM_MAILBOX,
    attachments: [
      {
        filename: `elta-drift-betalingsliste-${dateIso}.csv`,
        content: Buffer.from(csv, 'utf-8'),
        contentType: 'text/csv',
      },
    ],
  })

  if (!result.success) {
    await audit('payment_report_skipped', `Betalingsrapport-mail fejlede: ${result.error ?? 'ukendt'}`, {
      reason: 'send_failed',
      filter: opts.filter,
      row_count: rows.length,
    })
    return { status: 'failed', row_count: rows.length, recipients, reason: result.error ?? 'send_failed' }
  }

  await audit(
    opts.trigger === 'test' ? 'payment_report_test_sent' : 'payment_report_sent',
    `Betalingsrapport sendt til ${recipients.length} modtager(e) — ${rows.length} kunde(r)`,
    {
      filter: opts.filter,
      row_count: rows.length,
      recipient_count: recipients.length,
      total_outstanding: Math.round(totalOutstanding * 100) / 100,
    }
  )
  return { status: 'sent', row_count: rows.length, recipients }
}
