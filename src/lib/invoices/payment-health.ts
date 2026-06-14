/**
 * Sprint Ø4.4 — Kundens betalingsadfærd (cost-free).
 *
 * Isomorft og uden eksterne imports, så reglerne kan unit-testes direkte.
 * Bruger KUN faktura-/betalingsdata — ingen kost/margin/DB.
 *
 * Reglerne (dokumenteret, bevidst simple — ikke kreditvurdering):
 *   requires_attention : der findes forfaldne fakturaer lige nu (overdue_count > 0)
 *   no_data            : under 2 betalte fakturaer med forfaldsdato
 *   late_payer         : gennemsnitligt > 7 dage efter forfald (≥2 betalte)
 *   on_time            : gennemsnitligt ≤ 7 dage efter forfald, ingen forfaldne
 */

export type PaymentHealthStatus = 'no_data' | 'on_time' | 'late_payer' | 'requires_attention'

/** Cost-free fakturarække til beregning (kun salgs/faktura-data). */
export interface HealthInvoice {
  status: string
  invoice_type: string | null
  final_amount: number
  due_date: string | null
  voided_at: string | null
  paid_at: string | null
  sent_at: string | null
}

export interface PaymentHealthMetrics {
  outstanding_total: number
  overdue_count: number
  overdue_total: number
  draft_count: number
  paid_invoice_count: number
  average_days_late: number | null
  average_days_to_pay: number | null
  last_paid_at: string | null
  last_invoice_at: string | null
}

export interface PaymentHealth extends PaymentHealthMetrics {
  status: PaymentHealthStatus
  human_label: string
  human_summary: string
}

const DAY = 1000 * 60 * 60 * 24
const r2 = (n: number) => Math.round(n * 100) / 100

function daysBetween(fromIso: string, toMs: number): number {
  return Math.floor((toMs - new Date(fromIso.slice(0, 10) + 'T00:00:00').getTime()) / DAY)
}

/** Beregn cost-free betalings-metrics fra en liste af fakturaer. */
export function summarizeInvoicesForHealth(
  rows: HealthInvoice[],
  nowMs: number
): PaymentHealthMetrics {
  let outstanding = 0
  let overdueCount = 0
  let overdueTotal = 0
  let draftCount = 0
  let lastPaidAt: string | null = null
  let lastInvoiceAt: string | null = null
  const lateDays: number[] = []
  const payDays: number[] = []

  for (const r of rows) {
    const isCredit = r.invoice_type === 'credit'
    const active = !r.voided_at && !isCredit
    const amount = Number(r.final_amount ?? 0)

    if (r.status === 'draft' && !r.voided_at) draftCount += 1
    if (active && r.status === 'sent') outstanding += amount
    if (r.sent_at && (!lastInvoiceAt || r.sent_at > lastInvoiceAt)) lastInvoiceAt = r.sent_at

    if (active && r.status === 'sent' && r.due_date) {
      const d = daysBetween(r.due_date, nowMs)
      if (d > 0) { overdueCount += 1; overdueTotal += amount }
    }

    if (active && r.status === 'paid' && r.paid_at) {
      if (!lastPaidAt || r.paid_at > lastPaidAt) lastPaidAt = r.paid_at
      if (r.due_date) {
        // dage efter forfald (negativ = betalt før forfald)
        lateDays.push(daysBetween(r.due_date, new Date(r.paid_at).getTime()))
      }
      if (r.sent_at) {
        payDays.push(daysBetween(r.sent_at, new Date(r.paid_at).getTime()))
      }
    }
  }

  const avg = (arr: number[]): number | null =>
    arr.length === 0 ? null : Math.round(arr.reduce((s, n) => s + n, 0) / arr.length)

  return {
    outstanding_total: r2(outstanding),
    overdue_count: overdueCount,
    overdue_total: r2(overdueTotal),
    draft_count: draftCount,
    paid_invoice_count: lateDays.length,
    average_days_late: avg(lateDays),
    average_days_to_pay: avg(payDays),
    last_paid_at: lastPaidAt,
    last_invoice_at: lastInvoiceAt,
  }
}

/** Klassificér betalingsadfærd + menneskelige danske labels (uden beløb). */
export function classifyPaymentHealth(
  m: PaymentHealthMetrics
): { status: PaymentHealthStatus; human_label: string; human_summary: string } {
  if (m.overdue_count > 0) {
    return {
      status: 'requires_attention',
      human_label:
        m.overdue_count === 1 ? '1 forfalden faktura' : `${m.overdue_count} forfaldne fakturaer`,
      human_summary:
        m.overdue_count === 1
          ? 'Har 1 forfalden faktura, der kræver opfølgning.'
          : `Har ${m.overdue_count} forfaldne fakturaer, der kræver opfølgning.`,
    }
  }
  if (m.paid_invoice_count < 2 || m.average_days_late === null) {
    return {
      status: 'no_data',
      human_label: 'Ingen betalingshistorik',
      human_summary: 'Ingen betalingshistorik endnu.',
    }
  }
  const a = m.average_days_late
  if (a > 7) {
    return {
      status: 'late_payer',
      human_label: 'Ofte forsinket',
      human_summary: `Betaler typisk ${a} dage efter forfald.`,
    }
  }
  return {
    status: 'on_time',
    human_label: 'Betaler til tiden',
    human_summary:
      a <= 2
        ? 'Betaler typisk til tiden.'
        : `Betaler typisk ${a} dag${a === 1 ? '' : 'e'} efter forfald.`,
  }
}

export function computePaymentHealth(rows: HealthInvoice[], nowMs: number): PaymentHealth {
  const m = summarizeInvoicesForHealth(rows, nowMs)
  return { ...m, ...classifyPaymentHealth(m) }
}

/** Visuel skal pr. status (cost-free). */
export const PAYMENT_STATUS_SKIN: Record<PaymentHealthStatus, { cls: string }> = {
  requires_attention: { cls: 'bg-rose-100 text-rose-800 ring-rose-200' },
  late_payer: { cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  on_time: { cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  no_data: { cls: 'bg-gray-100 text-gray-600 ring-gray-200' },
}
