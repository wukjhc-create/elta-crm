import type { CompanySettings } from '@/types/company-settings.types'
import { formatDateLongDK, formatCurrency } from '@/lib/utils/format'

interface QuoteEmailParams {
  quoteReference: string
  title: string
  customerName: string
  companyName?: string
  total: number
  validUntil: Date
  companySettings: CompanySettings
  templateType: 'sales' | 'installation'
}

export function generateQuoteEmailHtml({
  quoteReference,
  title,
  customerName,
  companyName,
  total,
  validUntil,
  companySettings,
  templateType,
}: QuoteEmailParams): string {
  const accentColor = templateType === 'sales' ? '#0066cc' : '#16a34a'
  const templateLabel = templateType === 'sales' ? 'Salgstilbud' : 'Monteringstilbud'

  return `
<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${templateLabel} fra ${companySettings.company_name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f4f4f4;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      background-color: ${accentColor};
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .greeting {
      font-size: 18px;
      margin-bottom: 20px;
    }
    .offer-details {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .offer-details h2 {
      margin-top: 0;
      color: ${accentColor};
      font-size: 20px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: #666;
    }
    .detail-value {
      font-weight: 600;
    }
    .total-amount {
      font-size: 24px;
      color: ${accentColor};
      font-weight: bold;
    }
    .note {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      font-size: 14px;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px 30px;
      text-align: center;
      font-size: 12px;
      color: #666;
      border-top: 1px solid #eee;
    }
    .footer a {
      color: ${accentColor};
    }
    .company-info {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${templateLabel}</h1>
      <p>${quoteReference}</p>
    </div>

    <div class="content">
      <p class="greeting">
        Kære ${customerName}${companyName ? ` fra ${companyName}` : ''},
      </p>

      <p>
        Vi har udarbejdet et tilbud til dig. Tilbuddet er vedhæftet som PDF.
      </p>

      <div class="offer-details">
        <h2>${title}</h2>

        <div class="detail-row">
          <span class="detail-label">Tilbudsnummer:</span>
          <span class="detail-value">${quoteReference}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Dato:</span>
          <span class="detail-value">${formatDateLongDK(new Date().toISOString())}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Gyldig til:</span>
          <span class="detail-value">${formatDateLongDK(validUntil.toISOString())}</span>
        </div>

        <div class="detail-row" style="padding-top: 15px; margin-top: 10px; border-top: 2px solid ${accentColor};">
          <span class="detail-label" style="font-size: 18px; font-weight: bold;">Total inkl. moms:</span>
          <span class="total-amount">${formatCurrency(total, 'DKK', 2)}</span>
        </div>
      </div>

      <p>
        Tilbuddet er vedhæftet som PDF-fil. Åbn den vedhæftede fil for at se de fulde detaljer.
      </p>

      <div class="note">
        <strong>Bemærk:</strong> Dette tilbud er gyldigt til ${formatDateLongDK(validUntil.toISOString())}.
      </div>

      <p>
        Har du spørgsmål til tilbuddet, er du velkommen til at kontakte os.
      </p>

      <p>
        Med venlig hilsen,<br>
        <strong>${companySettings.company_name}</strong>
      </p>
    </div>

    <div class="footer">
      <p>
        Denne email er sendt fra ${companySettings.company_name}.
      </p>
      <div class="company-info">
        <strong>${companySettings.company_name}</strong><br>
        ${companySettings.company_address ? `${companySettings.company_address}<br>` : ''}
        ${companySettings.company_postal_code && companySettings.company_city ? `${companySettings.company_postal_code} ${companySettings.company_city}<br>` : ''}
        ${companySettings.company_vat_number ? `CVR: ${companySettings.company_vat_number}<br>` : ''}
        ${companySettings.company_phone ? `Tlf: ${companySettings.company_phone}<br>` : ''}
        ${companySettings.company_email ? `<a href="mailto:${companySettings.company_email}">${companySettings.company_email}</a>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`
}

export function generateQuoteEmailText({
  quoteReference,
  title,
  customerName,
  companyName,
  total,
  validUntil,
  companySettings,
  templateType,
}: QuoteEmailParams): string {
  const templateLabel = templateType === 'sales' ? 'SALGSTILBUD' : 'MONTERINGSTILBUD'

  return `
${templateLabel} ${quoteReference}
==============================

Kære ${customerName}${companyName ? ` fra ${companyName}` : ''},

Vi har udarbejdet et tilbud til dig. Tilbuddet er vedhæftet som PDF.

TILBUDSDETALJER
---------------
Titel: ${title}
Tilbudsnummer: ${quoteReference}
Dato: ${formatDateLongDK(new Date().toISOString())}
Gyldig til: ${formatDateLongDK(validUntil.toISOString())}
TOTAL inkl. moms: ${formatCurrency(total, 'DKK', 2)}

Tilbuddet er vedhæftet som PDF-fil. Åbn den vedhæftede fil for at se de fulde detaljer.

Bemærk: Dette tilbud er gyldigt til ${formatDateLongDK(validUntil.toISOString())}.

Har du spørgsmål til tilbuddet, er du velkommen til at kontakte os.

Med venlig hilsen,
${companySettings.company_name}

---
${companySettings.company_name}
${companySettings.company_address ? `${companySettings.company_address}` : ''}
${companySettings.company_postal_code && companySettings.company_city ? `${companySettings.company_postal_code} ${companySettings.company_city}` : ''}
${companySettings.company_vat_number ? `CVR: ${companySettings.company_vat_number}` : ''}
${companySettings.company_phone ? `Tlf: ${companySettings.company_phone}` : ''}
${companySettings.company_email || ''}
`
}
