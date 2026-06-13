/**
 * Invoice reminder email template (Phase 5.1).
 *
 * level 1 = friendly reminder (3+ days overdue)
 * level 2 = firm reminder    (10+ days overdue)
 * level 3 = warning          (20+ days overdue, queues manual review)
 */
import { BRAND_COMPANY_NAME, BRAND_EMAIL, BRAND_WEBSITE, BRAND_GREEN } from '@/lib/brand'
import { escapeHtml } from '@/lib/utils/html-escape'
import { bodyToHtml } from './invoice-email'
import {
  resolveTemplate,
  TEMPLATE_HEADLINES,
  type InvoiceEmailConfig,
  type InvoiceTemplateKey,
  type TemplateVars,
} from '@/lib/email/invoice-email-config'

export interface InvoiceReminderParams {
  customerName: string
  invoiceNumber: string
  finalAmountFormatted: string
  dueDateFormatted: string
  daysOverdue: number
  paymentReference?: string | null
  level: 1 | 2 | 3
  /** Sprint Ø3.7 — firmainfo + sag til template-variabler (fallback BRAND_*). */
  companyName?: string | null
  companyEmail?: string | null
  companyPhone?: string | null
  caseNumber?: string | null
}

function reminderKey(level: 1 | 2 | 3): InvoiceTemplateKey {
  return `reminder${level}` as InvoiceTemplateKey
}

function reminderVars(p: InvoiceReminderParams): TemplateVars {
  return {
    customer_name: p.customerName,
    invoice_number: p.invoiceNumber,
    amount: p.finalAmountFormatted,
    due_date: p.dueDateFormatted,
    days_overdue: p.daysOverdue,
    payment_reference: p.paymentReference ?? '',
    case_number: p.caseNumber ?? '',
    company_name: p.companyName || BRAND_COMPANY_NAME,
    company_email: p.companyEmail || BRAND_EMAIL,
    company_phone: p.companyPhone ?? '',
  }
}

export function buildInvoiceReminderSubject(
  p: InvoiceReminderParams,
  cfg?: InvoiceEmailConfig | null
): string {
  return resolveTemplate(cfg, reminderKey(p.level), reminderVars(p)).subject
}

export function buildInvoiceReminderHtml(
  p: InvoiceReminderParams,
  cfg?: InvoiceEmailConfig | null
): string {
  const refRow = p.paymentReference
    ? `<tr><td style="padding:6px 0;color:#6b7280">Betalingsreference</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.paymentReference)}</strong></td></tr>`
    : ''
  const headline = TEMPLATE_HEADLINES[reminderKey(p.level)]
  const { body } = resolveTemplate(cfg, reminderKey(p.level), reminderVars(p))

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827">
  <div style="background:${BRAND_GREEN};padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:20px">${escapeHtml(headline)}</h1>
  </div>
  <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px;margin:0 0 12px">Kære ${escapeHtml(p.customerName)},</p>
    ${bodyToHtml(body)}

    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280">Fakturanummer</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.invoiceNumber)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Beløb</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.finalAmountFormatted)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Forfaldsdato</td><td style="padding:6px 0;color:#111827">${escapeHtml(p.dueDateFormatted)} (${p.daysOverdue} dage forfalden)</td></tr>
      ${refRow}
    </table>

    <p style="color:#374151;margin:24px 0 0">
      Med venlig hilsen,<br/>
      <strong>${escapeHtml(p.companyName || BRAND_COMPANY_NAME)}</strong><br/>
      <span style="color:#6b7280;font-size:13px">${escapeHtml(p.companyEmail || BRAND_EMAIL)}${p.companyPhone ? ` &bull; ${escapeHtml(p.companyPhone)}` : ''} &bull; ${escapeHtml(BRAND_WEBSITE)}</span>
    </p>
  </div>
</div>`.trim()
}

