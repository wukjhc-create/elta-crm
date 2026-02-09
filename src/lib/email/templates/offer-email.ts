import type { OfferWithRelations } from '@/types/offers.types'
import type { CompanySettings } from '@/types/company-settings.types'
import { formatDateLongDK } from '@/lib/utils/format'

interface OfferEmailParams {
  offer: OfferWithRelations
  companySettings: CompanySettings
  portalUrl: string
}

// Format currency
function formatCurrency(amount: number, currency: string = 'DKK'): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

// Format date
function formatDate(dateString: string): string {
  return formatDateLongDK(dateString)
}

export function generateOfferEmailHtml({
  offer,
  companySettings,
  portalUrl,
}: OfferEmailParams): string {
  const customerName = offer.customer?.contact_person || 'Kunde'
  const companyName = offer.customer?.company_name || ''

  return `
<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tilbud fra ${companySettings.company_name}</title>
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
      background-color: #0066cc;
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
      color: #0066cc;
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
      color: #0066cc;
      font-weight: bold;
    }
    .cta-container {
      text-align: center;
      margin: 30px 0;
    }
    .cta-button {
      display: inline-block;
      background-color: #0066cc;
      color: white !important;
      text-decoration: none;
      padding: 15px 40px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
    }
    .cta-button:hover {
      background-color: #0052a3;
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
      color: #0066cc;
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
      <h1>Tilbud</h1>
      <p>${offer.offer_number}</p>
    </div>

    <div class="content">
      <p class="greeting">
        Kære ${customerName}${companyName ? ` fra ${companyName}` : ''},
      </p>

      <p>
        Tak for din interesse. Vi har udarbejdet et tilbud til dig, som du kan se nedenfor.
      </p>

      <div class="offer-details">
        <h2>${offer.title}</h2>

        ${offer.description ? `<p>${offer.description}</p>` : ''}

        <div class="detail-row">
          <span class="detail-label">Tilbudsnummer:</span>
          <span class="detail-value">${offer.offer_number}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Dato:</span>
          <span class="detail-value">${formatDate(offer.created_at)}</span>
        </div>

        ${offer.valid_until ? `
        <div class="detail-row">
          <span class="detail-label">Gyldig til:</span>
          <span class="detail-value">${formatDate(offer.valid_until)}</span>
        </div>
        ` : ''}

        <div class="detail-row">
          <span class="detail-label">Subtotal:</span>
          <span class="detail-value">${formatCurrency(offer.total_amount, offer.currency)}</span>
        </div>

        ${offer.discount_percentage > 0 ? `
        <div class="detail-row">
          <span class="detail-label">Rabat (${offer.discount_percentage}%):</span>
          <span class="detail-value" style="color: #dc2626;">-${formatCurrency(offer.discount_amount, offer.currency)}</span>
        </div>
        ` : ''}

        <div class="detail-row">
          <span class="detail-label">Moms (${offer.tax_percentage}%):</span>
          <span class="detail-value">${formatCurrency(offer.tax_amount, offer.currency)}</span>
        </div>

        <div class="detail-row" style="padding-top: 15px; margin-top: 10px; border-top: 2px solid #0066cc;">
          <span class="detail-label" style="font-size: 18px; font-weight: bold;">Total:</span>
          <span class="total-amount">${formatCurrency(offer.final_amount, offer.currency)}</span>
        </div>
      </div>

      <div class="cta-container">
        <a href="${portalUrl}" class="cta-button">Se tilbud og accepter</a>
      </div>

      <p>
        Ved at klikke på knappen ovenfor kan du se det fulde tilbud med alle detaljer og acceptere det digitalt.
      </p>

      ${offer.valid_until ? `
      <div class="note">
        <strong>Bemærk:</strong> Dette tilbud er gyldigt til ${formatDate(offer.valid_until)}.
      </div>
      ` : ''}

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

export function generateOfferEmailText({
  offer,
  companySettings,
  portalUrl,
}: OfferEmailParams): string {
  const customerName = offer.customer?.contact_person || 'Kunde'
  const companyName = offer.customer?.company_name || ''

  return `
TILBUD ${offer.offer_number}
==============================

Kære ${customerName}${companyName ? ` fra ${companyName}` : ''},

Tak for din interesse. Vi har udarbejdet et tilbud til dig.

TILBUDSDETALJER
---------------
Titel: ${offer.title}
${offer.description ? `Beskrivelse: ${offer.description}` : ''}
Tilbudsnummer: ${offer.offer_number}
Dato: ${formatDate(offer.created_at)}
${offer.valid_until ? `Gyldig til: ${formatDate(offer.valid_until)}` : ''}

Subtotal: ${formatCurrency(offer.total_amount, offer.currency)}
${offer.discount_percentage > 0 ? `Rabat (${offer.discount_percentage}%): -${formatCurrency(offer.discount_amount, offer.currency)}` : ''}
Moms (${offer.tax_percentage}%): ${formatCurrency(offer.tax_amount, offer.currency)}
TOTAL: ${formatCurrency(offer.final_amount, offer.currency)}

SE OG ACCEPTER TILBUD
---------------------
Klik på linket nedenfor for at se det fulde tilbud og acceptere det digitalt:
${portalUrl}

${offer.valid_until ? `Bemærk: Dette tilbud er gyldigt til ${formatDate(offer.valid_until)}.` : ''}

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
