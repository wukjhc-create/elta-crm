/**
 * Initial invoice email (Phase 5.2).
 *
 * Sent the moment an invoice is created from an accepted offer.
 * Includes invoice number, amount, due date, and payment instructions.
 */
import {
  BRAND_COMPANY_NAME,
  BRAND_EMAIL,
  BRAND_WEBSITE,
  BRAND_GREEN,
  BRAND_CVR,
} from '@/lib/brand'
import { escapeHtml } from '@/lib/utils/html-escape'
import {
  resolveTemplate,
  type InvoiceEmailConfig,
  type TemplateVars,
} from '@/lib/email/invoice-email-config'

export interface InvoiceEmailParams {
  customerName: string
  invoiceNumber: string
  finalAmountFormatted: string
  dueDateFormatted: string
  paymentReference: string
  bankRegNo?: string | null
  bankAccount?: string | null
  /** Sprint Ø3.7 — firmainfo + sag til template-variabler (fallback BRAND_*). */
  companyName?: string | null
  companyEmail?: string | null
  companyPhone?: string | null
  caseNumber?: string | null
  /** Sprint 6F-4 — sat når invoice_type='credit'. Skifter subject + body
   *  til kreditnota-tekst, så kunden ikke bliver bedt om at betale. */
  isCreditNote?: boolean
  /** Sprint 6F-4 — kun relevant ved kreditnotaer. Original-fakturaens
   *  nummer som vises i mailen. */
  creditOfInvoiceNumber?: string | null
}

/** Sprint Ø3.7 — sikre template-variabler fra params (kundevendt). */
function invoiceVars(p: InvoiceEmailParams): TemplateVars {
  return {
    customer_name: p.customerName,
    invoice_number: p.invoiceNumber,
    amount: p.finalAmountFormatted,
    due_date: p.dueDateFormatted,
    payment_reference: p.paymentReference,
    case_number: p.caseNumber ?? '',
    company_name: p.companyName || BRAND_COMPANY_NAME,
    company_email: p.companyEmail || BRAND_EMAIL,
    company_phone: p.companyPhone ?? '',
  }
}

/** Sprint Ø3.7 — redigerbar brødtekst → sikre HTML-afsnit (escaped). */
export function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="color:#374151;margin:0 0 16px">${escapeHtml(para.trim()).replace(/\n/g, '<br/>')}</p>`
    )
    .join('\n    ')
}

export function buildInvoiceEmailSubject(
  p: InvoiceEmailParams,
  cfg?: InvoiceEmailConfig | null
): string {
  if (p.isCreditNote) {
    return `Kreditnota ${p.invoiceNumber} fra ${p.companyName || BRAND_COMPANY_NAME}`
  }
  return resolveTemplate(cfg, 'invoice', invoiceVars(p)).subject
}

export function buildInvoiceEmailHtml(
  p: InvoiceEmailParams,
  cfg?: InvoiceEmailConfig | null
): string {
  if (p.isCreditNote) {
    return buildCreditNoteEmailHtml(p)
  }

  const bankBlock =
    p.bankRegNo && p.bankAccount
      ? `<tr><td style="padding:6px 0;color:#6b7280">Bankoverførsel</td><td style="padding:6px 0;color:#111827">Reg. ${escapeHtml(p.bankRegNo)} · Konto ${escapeHtml(p.bankAccount)}</td></tr>`
      : ''

  const { body } = resolveTemplate(cfg, 'invoice', invoiceVars(p))

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827">
  <div style="background:${BRAND_GREEN};padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:20px">Tak for din ordre</h1>
    <p style="color:#e8f5e8;margin:6px 0 0;font-size:14px">Faktura ${escapeHtml(p.invoiceNumber)}</p>
  </div>
  <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px;margin:0 0 12px">Kære ${escapeHtml(p.customerName)},</p>
    ${bodyToHtml(body)}

    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280">Fakturanummer</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.invoiceNumber)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Beløb inkl. moms</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.finalAmountFormatted)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Forfaldsdato</td><td style="padding:6px 0;color:#111827">${escapeHtml(p.dueDateFormatted)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Betalingsreference</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.paymentReference)}</strong></td></tr>
      ${bankBlock}
    </table>

    <p style="color:#374151;margin:24px 0 0">
      Med venlig hilsen,<br/>
      <strong>${escapeHtml(p.companyName || BRAND_COMPANY_NAME)}</strong><br/>
      <span style="color:#6b7280;font-size:13px">CVR ${escapeHtml(BRAND_CVR)} &bull; ${escapeHtml(p.companyEmail || BRAND_EMAIL)}${p.companyPhone ? ` &bull; ${escapeHtml(p.companyPhone)}` : ''} &bull; ${escapeHtml(BRAND_WEBSITE)}</span>
    </p>
  </div>
</div>`.trim()
}

/**
 * Sprint 6F-4 — separat HTML-skabelon til kreditnotaer.
 * Ingen "betal", ingen forfaldsdato, ingen bank-info — fokus på at
 * forklare at det er en kreditnota og at refundering håndteres separat.
 */
function buildCreditNoteEmailHtml(p: InvoiceEmailParams): string {
  const creditOfRow = p.creditOfInvoiceNumber
    ? `<tr><td style="padding:6px 0;color:#6b7280">Krediterer faktura</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.creditOfInvoiceNumber)}</strong></td></tr>`
    : ''
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827">
  <div style="background:#A04040;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:20px">Kreditnota</h1>
    <p style="color:#fde6e6;margin:6px 0 0;font-size:14px">Kreditnota ${escapeHtml(p.invoiceNumber)}</p>
  </div>
  <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px;margin:0 0 12px">Kære ${escapeHtml(p.customerName)},</p>
    <p style="color:#374151;margin:0 0 16px">
      Vedhæftet finder du en kreditnota. Kreditnotaen reducerer eller udligner
      en tidligere faktura. Eventuel refundering håndteres separat.
    </p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280">Kreditnota nr.</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.invoiceNumber)}</strong></td></tr>
      ${creditOfRow}
      <tr><td style="padding:6px 0;color:#6b7280">Beløb inkl. moms</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.finalAmountFormatted)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Reference</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.paymentReference)}</strong></td></tr>
    </table>

    <p style="color:#374151;margin:16px 0 0">
      Har du spørgsmål til kreditnotaen, så er du meget velkommen til at kontakte os.
    </p>
    <p style="color:#374151;margin:24px 0 0">
      Med venlig hilsen,<br/>
      <strong>${escapeHtml(BRAND_COMPANY_NAME)}</strong><br/>
      <span style="color:#6b7280;font-size:13px">CVR ${escapeHtml(BRAND_CVR)} &bull; ${escapeHtml(BRAND_EMAIL)} &bull; ${escapeHtml(BRAND_WEBSITE)}</span>
    </p>
  </div>
</div>`.trim()
}

