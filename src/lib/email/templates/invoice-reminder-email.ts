/**
 * Invoice reminder email template (Phase 5.1).
 *
 * level 1 = friendly reminder (3+ days overdue)
 * level 2 = firm reminder    (10+ days overdue)
 * level 3 = warning          (20+ days overdue, queues manual review)
 */
import { BRAND_COMPANY_NAME, BRAND_EMAIL, BRAND_WEBSITE, BRAND_GREEN } from '@/lib/brand'
import { escapeHtml } from '@/lib/utils/html-escape'

export interface InvoiceReminderParams {
  customerName: string
  invoiceNumber: string
  finalAmountFormatted: string
  dueDateFormatted: string
  daysOverdue: number
  paymentReference?: string | null
  level: 1 | 2 | 3
}

const TONE: Record<1 | 2 | 3, { headline: string; lead: string; close: string; subjectPrefix: string }> = {
  1: {
    headline: 'Venlig påmindelse om betaling',
    lead: 'Vi har ikke registreret betaling af nedenstående faktura endnu. Måske er den blot blevet overset.',
    close: 'Skulle betalingen allerede være foretaget, kan du naturligvis se bort fra denne mail.',
    subjectPrefix: 'Påmindelse',
  },
  2: {
    headline: 'Anden påmindelse — udestående betaling',
    lead: 'Vi har tidligere sendt en venlig påmindelse, men har stadig ikke modtaget betaling.',
    close: 'Bedes du venligst betale snarest, eller kontakte os hvis der er noget vi skal være opmærksomme på.',
    subjectPrefix: 'Anden påmindelse',
  },
  3: {
    headline: 'Sidste varsel — manuel behandling',
    lead: 'Fakturaen er nu mere end 20 dage forfalden og overgår til manuel behandling hos os.',
    close: 'Kontakt os omgående, så vi kan finde en løsning inden videre skridt.',
    subjectPrefix: 'Sidste varsel',
  },
}

export function buildInvoiceReminderSubject(p: InvoiceReminderParams): string {
  return `${TONE[p.level].subjectPrefix}: Faktura ${p.invoiceNumber} — ${BRAND_COMPANY_NAME}`
}

export function buildInvoiceReminderHtml(p: InvoiceReminderParams): string {
  const t = TONE[p.level]
  const refRow = p.paymentReference
    ? `<tr><td style="padding:6px 0;color:#6b7280">Betalingsreference</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.paymentReference)}</strong></td></tr>`
    : ''

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827">
  <div style="background:${BRAND_GREEN};padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:20px">${escapeHtml(t.headline)}</h1>
  </div>
  <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px;margin:0 0 12px">Kære ${escapeHtml(p.customerName)},</p>
    <p style="color:#374151;margin:0 0 16px">${escapeHtml(t.lead)}</p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280">Fakturanummer</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.invoiceNumber)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Beløb</td><td style="padding:6px 0;color:#111827"><strong>${escapeHtml(p.finalAmountFormatted)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Forfaldsdato</td><td style="padding:6px 0;color:#111827">${escapeHtml(p.dueDateFormatted)} (${p.daysOverdue} dage forfalden)</td></tr>
      ${refRow}
    </table>

    <p style="color:#374151;margin:16px 0 0">${escapeHtml(t.close)}</p>
    <p style="color:#374151;margin:24px 0 0">
      Med venlig hilsen,<br/>
      <strong>${escapeHtml(BRAND_COMPANY_NAME)}</strong><br/>
      <span style="color:#6b7280;font-size:13px">${escapeHtml(BRAND_EMAIL)} &bull; ${escapeHtml(BRAND_WEBSITE)}</span>
    </p>
  </div>
</div>`.trim()
}

