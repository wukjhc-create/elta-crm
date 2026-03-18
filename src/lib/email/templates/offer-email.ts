/**
 * Offer Email Template — Professional HTML for outbound offer emails
 *
 * Fully inline-styled for Outlook, Gmail, Apple Mail compatibility.
 * Table-based layout. Uses Elta Solar brand colors from brand.ts.
 * Matches the CRM reply template structure 1:1.
 */
import type { OfferWithRelations } from '@/types/offers.types'
import type { CompanySettings } from '@/types/company-settings.types'
import { formatDateLongDK, formatCurrency } from '@/lib/utils/format'
import { BRAND_GREEN, BRAND_GREEN_DARK, BRAND_ORANGE } from '@/lib/brand'

interface OfferEmailParams {
  offer: OfferWithRelations
  companySettings: CompanySettings
  portalUrl: string
}

export function generateOfferEmailHtml({
  offer,
  companySettings,
  portalUrl,
}: OfferEmailParams): string {
  const customerName = offer.customer?.contact_person || 'Kunde'
  const companyName = offer.customer?.company_name || ''

  // Build detail rows
  const detailRows: string[] = []

  detailRows.push(detailRow('Tilbudsnummer', offer.offer_number))
  detailRows.push(detailRow('Dato', formatDateLongDK(offer.created_at)))

  if (offer.valid_until) {
    detailRows.push(detailRow('Gyldig til', formatDateLongDK(offer.valid_until)))
  }

  detailRows.push(detailRow('Subtotal', formatCurrency(offer.total_amount, offer.currency, 2)))

  if (offer.discount_percentage > 0) {
    detailRows.push(detailRow(
      `Rabat (${offer.discount_percentage}%)`,
      `-${formatCurrency(offer.discount_amount, offer.currency, 2)}`,
      '#dc2626'
    ))
  }

  detailRows.push(detailRow(`Moms (${offer.tax_percentage}%)`, formatCurrency(offer.tax_amount, offer.currency, 2)))

  const validUntilNote = offer.valid_until
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
        <tr>
          <td style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 14px 18px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #92400e; border-radius: 4px;">
            <strong>Bemærk:</strong> Dette tilbud er gyldigt til ${formatDateLongDK(offer.valid_until)}.
          </td>
        </tr>
      </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="da" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Tilbud fra ${companySettings.company_name}</title>
  <!--[if mso]>
  <style>body,table,td,p,a{font-family:Arial,Helvetica,sans-serif!important;}</style>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f0f2f5; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%;">

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f0f2f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Inner container (600px) -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%; border-collapse: separate;">

          <!-- ============================== -->
          <!-- HEADER — Brand green with logo -->
          <!-- ============================== -->
          <tr>
            <td style="background-color: ${BRAND_GREEN}; padding: 0; border-radius: 12px 12px 0 0;">
              <!-- Orange accent line -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="height: 4px; background-color: ${BRAND_ORANGE}; border-radius: 12px 12px 0 0; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
              </table>
              <!-- Logo row -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding: 28px 32px 24px 32px;" align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding-bottom: 8px;">
                          <span style="font-size: 40px; line-height: 1;">&#9788;</span>
                        </td>
                      </tr>
                      <tr>
                        <td align="center">
                          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: 2px;">
                            ELTA SOLAR
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top: 4px;">
                          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; color: rgba(255,255,255,0.70); letter-spacing: 1.5px; text-transform: uppercase;">
                            Professionelle el- &amp; solcelleinstallationer
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top: 14px;">
                          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color: rgba(255,255,255,0.85);">
                            Tilbud ${offer.offer_number}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============================== -->
          <!-- BODY — White card              -->
          <!-- ============================== -->
          <tr>
            <td style="background-color: #ffffff; padding: 36px 36px 12px 36px; border-left: 1px solid #e2e5e9; border-right: 1px solid #e2e5e9;">
              <!-- Greeting -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 18px; line-height: 1.4; color: #1f2937; padding-bottom: 16px;">
                    Kære ${customerName}${companyName ? ` fra ${companyName}` : ''},
                  </td>
                </tr>
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #374151; padding-bottom: 24px;">
                    Tak for din interesse. Vi har udarbejdet et tilbud til dig, som du kan se nedenfor.
                  </td>
                </tr>
              </table>

              <!-- Offer Details Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8f9fa; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 24px;">
                    <!-- Offer title -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 20px; font-weight: 700; color: ${BRAND_GREEN}; padding-bottom: 12px;">
                          ${offer.title}
                        </td>
                      </tr>
                      ${offer.description ? `<tr><td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color: #4b5563; line-height: 1.6; padding-bottom: 16px;">${offer.description}</td></tr>` : ''}
                    </table>

                    <!-- Detail rows -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${detailRows.join('')}
                    </table>

                    <!-- TOTAL row -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 12px; border-top: 2px solid ${BRAND_GREEN};">
                      <tr>
                        <td style="padding-top: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 18px; font-weight: 700; color: #1f2937;">
                          Total:
                        </td>
                        <td align="right" style="padding-top: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 24px; font-weight: 800; color: ${BRAND_GREEN};">
                          ${formatCurrency(offer.final_amount, offer.currency, 2)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 8px 0 24px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${BRAND_GREEN}" style="border-radius:8px;">
                        <a href="${portalUrl}" target="_blank" style="font-size:17px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;padding:17px 44px;display:inline-block;font-weight:bold;">Se dit tilbud her</a>
                      </td>
                    </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 12px;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #6b7280;">
                      Klik for at se og acceptere dit tilbud online
                    </span>
                  </td>
                </tr>
              </table>

              ${validUntilNote}

              <!-- Closing text -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #374151; padding-bottom: 8px;">
                    Har du spørgsmål til tilbuddet, er du velkommen til at kontakte os.
                  </td>
                </tr>
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #374151; padding-top: 16px; padding-bottom: 8px;">
                    Med venlig hilsen,<br />
                    <strong style="color: #1f2937;">${companySettings.company_name}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============================== -->
          <!-- FOOTER — Green branded         -->
          <!-- ============================== -->
          <tr>
            <td style="padding: 24px 36px; border-radius: 0 0 12px 12px; background-color: ${BRAND_GREEN};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.8;">
                    <strong style="color: #ffffff;">${companySettings.company_name}</strong>
                    ${companySettings.company_vat_number ? ` &bull; CVR: ${companySettings.company_vat_number}` : ''}
                    <br />
                    ${companySettings.company_address ? `${companySettings.company_address}<br />` : ''}
                    ${companySettings.company_postal_code && companySettings.company_city ? `${companySettings.company_postal_code} ${companySettings.company_city}<br />` : ''}
                    ${companySettings.company_phone ? `Tlf: ${companySettings.company_phone} &bull; ` : ''}
                    ${companySettings.company_email ? `<a href="mailto:${companySettings.company_email}" style="color: rgba(255,255,255,0.9); text-decoration: none;">${companySettings.company_email}</a>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Inner container -->

        <!-- Micro-text -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%;">
          <tr>
            <td align="center" style="padding: 16px 0;">
              <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; color: #b0b5bd;">
                Denne email er sendt fra ${companySettings.company_name}.
              </span>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`
}

function detailRow(label: string, value: string, valueColor?: string): string {
  return `<tr>
    <td style="padding: 9px 0; border-bottom: 1px solid #eee; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color: #6b7280;">
      ${label}
    </td>
    <td align="right" style="padding: 9px 0; border-bottom: 1px solid #eee; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 600; color: ${valueColor || '#1f2937'};">
      ${value}
    </td>
  </tr>`
}


export function generateOfferEmailText({
  offer,
  companySettings,
  portalUrl,
}: OfferEmailParams): string {
  const customerName = offer.customer?.contact_person || 'Kunde'
  const companyName = offer.customer?.company_name || ''

  return `
ELTA SOLAR — Professionelle el- & solcelleinstallationer
=========================================================

TILBUD ${offer.offer_number}

Kære ${customerName}${companyName ? ` fra ${companyName}` : ''},

Tak for din interesse. Vi har udarbejdet et tilbud til dig.

TILBUDSDETALJER
---------------
Titel: ${offer.title}
${offer.description ? `Beskrivelse: ${offer.description}` : ''}
Tilbudsnummer: ${offer.offer_number}
Dato: ${formatDateLongDK(offer.created_at)}
${offer.valid_until ? `Gyldig til: ${formatDateLongDK(offer.valid_until)}` : ''}

Subtotal: ${formatCurrency(offer.total_amount, offer.currency, 2)}
${offer.discount_percentage > 0 ? `Rabat (${offer.discount_percentage}%): -${formatCurrency(offer.discount_amount, offer.currency, 2)}` : ''}
Moms (${offer.tax_percentage}%): ${formatCurrency(offer.tax_amount, offer.currency, 2)}
TOTAL: ${formatCurrency(offer.final_amount, offer.currency, 2)}

SE OG ACCEPTER TILBUD
---------------------
Klik på linket nedenfor for at se det fulde tilbud og acceptere det digitalt:
${portalUrl}

${offer.valid_until ? `Bemærk: Dette tilbud er gyldigt til ${formatDateLongDK(offer.valid_until)}.` : ''}

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
