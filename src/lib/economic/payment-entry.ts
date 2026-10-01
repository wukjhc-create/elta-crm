/**
 * e-conomic kassekladde-postering for en kundebetaling — ren mapping + kontrol.
 * Bruges af economic-client.markInvoicePaidInEconomic (kører automatisk når en
 * faktura bliver fuldt betalt og e-conomic er opsat).
 *
 * Fund rettet her:
 *   - Bogføringsdato var dags dato i UTC — nu betalingsdatoen (paid_at) som
 *     dansk kalenderdag (en sent registreret betaling lander i rette periode).
 *   - Faktura der kun er KLADDE i e-conomic ("draft-123") gav
 *     bookedInvoiceNumber = NaN → afvises med klar besked.
 *   - Kreditnota (negativt beløb) blev bogført som INDbetaling → afvises
 *     (udbetaling til kunden registreres manuelt i e-conomic).
 */

import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export interface PaymentEntryInput {
  invoice: {
    external_invoice_id: string | null
    currency?: string | null
    final_amount: number | string | null
    amount_paid?: number | string | null
    paid_at?: string | null
  }
  config: { cashbookNumber?: number | null; bankContraAccountNumber?: number | null }
  /** "nu" — kun til tests */
  now?: Date
}

export type PaymentIssueCode = 'not_exported' | 'draft_only' | 'credit_note' | 'missing_config' | 'no_amount' | 'paid_at_missing'

export interface PaymentIssue {
  code: PaymentIssueCode
  severity: 'error' | 'info'
  message: string
}

export interface PaymentEntry {
  body: {
    text: string
    amount: number
    currency: { code: string }
    date: string
    contraAccount: { accountNumber: number | null }
    customerInvoice: { bookedInvoiceNumber: number | null }
  }
  issues: PaymentIssue[]
  canPost: boolean
}

export function buildEconomicPaymentEntry(input: PaymentEntryInput): PaymentEntry {
  const { invoice, config } = input
  const issues: PaymentIssue[] = []
  const ext = invoice.external_invoice_id

  let booked: number | null = null
  if (!ext) {
    issues.push({ code: 'not_exported', severity: 'error', message: 'Fakturaen er ikke eksporteret til e-conomic endnu' })
  } else if (!/^\d+$/.test(ext)) {
    issues.push({ code: 'draft_only', severity: 'error', message: `Fakturaen er kun en kladde i e-conomic (${ext}) — bogfør kladden i e-conomic før betalingen kan registreres` })
  } else {
    booked = Number(ext)
  }

  if (!config.cashbookNumber || !config.bankContraAccountNumber) {
    issues.push({ code: 'missing_config', severity: 'error', message: 'Kassekladde og/eller bankkonto mangler i e-conomic-opsætningen' })
  }

  const final = Number(invoice.final_amount ?? 0)
  const paid = Number(invoice.amount_paid ?? 0)
  if (final < 0) {
    issues.push({ code: 'credit_note', severity: 'error', message: 'Kreditnota — udbetaling til kunden registreres manuelt i e-conomic' })
  }
  const amount = paid > 0 ? paid : final
  if (!(amount > 0) && final >= 0) {
    issues.push({ code: 'no_amount', severity: 'error', message: 'Intet betalt beløb at registrere' })
  }

  const when = invoice.paid_at || (input.now ?? new Date()).toISOString()
  if (!invoice.paid_at) {
    issues.push({ code: 'paid_at_missing', severity: 'info', message: 'Betalingsdato mangler — dags dato bruges' })
  }

  return {
    body: {
      text: `Indbetaling faktura ${ext ?? ''}`.trim(),
      amount: -Math.abs(amount), // negativ = indbetaling fra kunde (nedbringer debitor)
      currency: { code: invoice.currency || 'DKK' },
      date: copenhagenParts(when).date,
      contraAccount: { accountNumber: config.bankContraAccountNumber ?? null },
      customerInvoice: { bookedInvoiceNumber: booked },
    },
    issues,
    canPost: !issues.some((i) => i.severity === 'error'),
  }
}
