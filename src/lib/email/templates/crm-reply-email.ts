/**
 * CRM Reply Email Template — Professional HTML for outbound emails
 *
 * Fully inline-styled for Outlook, Gmail, Apple Mail compatibility.
 * Uses Elta Solar brand colors: Green #2D8A2D, Orange #E8841A.
 * Table-based layout for maximum email client compatibility.
 */

export interface CrmReplyTemplateParams {
  /** The reply message body (plain text, newlines become <br>) */
  messageBody: string
  /** Sender's full name (e.g. "Henrik Jensen") */
  senderName: string
  /** Sender's job title (optional) */
  senderTitle?: string
  /** Sender's direct phone (optional) */
  senderPhone?: string
  /** Sender's direct email */
  senderEmail?: string
  /** Original email date string (formatted in Danish) */
  originalDate: string
  /** Original sender name or email */
  originalSender: string
  /** Original email body (sanitized HTML) */
  originalBody: string
  /** Optional CTA link (e.g. to offer portal) */
  ctaUrl?: string
  /** Optional CTA button text */
  ctaLabel?: string
}

import { BRAND_GREEN, BRAND_GREEN_DARK, BRAND_ORANGE, BRAND_ORANGE_DARK } from '@/lib/brand'

export function generateCrmReplyHtml(params: CrmReplyTemplateParams): string {
  const {
    messageBody,
    senderName,
    senderTitle,
    senderPhone,
    senderEmail,
    originalDate,
    originalSender,
    originalBody,
    ctaUrl,
    ctaLabel,
  } = params

  const messageHtml = messageBody.replace(/\n/g, '<br />')

  // CTA button — large, orange for maximum visibility
  const ctaBlock = ctaUrl
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 28px 0 8px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${BRAND_GREEN}" style="border-radius:8px;">
                        <a href="${ctaUrl}" target="_blank" style="font-size:17px;font-family:Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;padding:16px 40px;display:inline-block;font-weight:bold;">${ctaLabel || 'Se dit tilbud her'}</a>
                      </td>
                    </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 10px;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #9ca3af;">
                      Klik for at se og acceptere dit tilbud online
                    </span>
                  </td>
                </tr>
              </table>`
    : ''

  const phoneRow = senderPhone
    ? `<tr><td style="padding: 2px 0; font-size: 13px;"><span style="color: #6b7280;">Tlf: </span><a href="tel:${senderPhone}" style="color: ${BRAND_GREEN}; text-decoration: none; font-weight: 500;">${senderPhone}</a></td></tr>`
    : ''

  const emailRow = senderEmail
    ? `<tr><td style="padding: 2px 0; font-size: 13px;"><span style="color: #6b7280;">Email: </span><a href="mailto:${senderEmail}" style="color: ${BRAND_GREEN}; text-decoration: none; font-weight: 500;">${senderEmail}</a></td></tr>`
    : ''

  const titleRow = senderTitle
    ? `<tr><td style="padding: 0 0 4px 0; font-size: 13px; color: #6b7280;">${senderTitle}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="da" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Elta Solar</title>
  <!--[if mso]>
  <style>body,table,td,p,a{font-family:Arial,Helvetica,sans-serif!important;}</style>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f0f2f5; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%;">

  <!-- Outer wrapper (gray bg) -->
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
              <!-- Top accent line (orange) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="height: 4px; background-color: ${BRAND_ORANGE}; border-radius: 12px 12px 0 0; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
              </table>
              <!-- Logo row -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding: 24px 32px 20px 32px;" align="center">
                    <!-- Sun icon + brand text -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding-bottom: 8px;">
                          <span style="font-size: 36px; line-height: 1;">&#9788;</span>
                        </td>
                      </tr>
                      <tr>
                        <td align="center">
                          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: 2px;">
                            ELTA SOLAR
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top: 4px;">
                          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: rgba(255,255,255,0.75); letter-spacing: 1.5px; text-transform: uppercase;">
                            Professionelle el- &amp; solcelleinstallationer
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
            <td style="background-color: #ffffff; padding: 36px 36px 20px 36px; border-left: 1px solid #e2e5e9; border-right: 1px solid #e2e5e9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.75; color: #1f2937;">
                    ${messageHtml}
                  </td>
                </tr>
              </table>

              <!-- CTA Button (if offer link provided) -->
              ${ctaBlock}
            </td>
          </tr>

          <!-- ============================== -->
          <!-- SIGNATURE                      -->
          <!-- ============================== -->
          <tr>
            <td style="background-color: #ffffff; padding: 8px 36px 32px 36px; border-left: 1px solid #e2e5e9; border-right: 1px solid #e2e5e9;">
              <!-- Green divider line -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding-bottom: 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="height: 2px; background-color: ${BRAND_GREEN}; font-size: 0; line-height: 0;" width="60">&nbsp;</td>
                        <td style="height: 2px; background-color: #e5e7eb; font-size: 0; line-height: 0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Signature content -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Green accent bar -->
                  <td style="width: 4px; background-color: ${BRAND_GREEN}; border-radius: 2px;" valign="top">&nbsp;</td>
                  <td style="padding-left: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom: 2px;">
                          <span style="font-size: 16px; font-weight: 700; color: #1f2937;">${senderName}</span>
                        </td>
                      </tr>
                      ${titleRow}
                      ${phoneRow}
                      ${emailRow}
                      <tr>
                        <td style="padding-top: 8px;">
                          <span style="font-size: 14px; font-weight: 700; color: ${BRAND_GREEN};">Elta Solar ApS</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 2px;">
                          <a href="https://eltasolar.dk" style="font-size: 12px; color: ${BRAND_ORANGE}; text-decoration: none; font-weight: 500;">eltasolar.dk</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============================== -->
          <!-- ORIGINAL MESSAGE (quoted)      -->
          <!-- ============================== -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 24px 36px; border: 1px solid #e2e5e9; border-top: none;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #9ca3af; padding-bottom: 12px;">
                    Den ${originalDate} skrev ${originalSender}:
                  </td>
                </tr>
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #6b7280; padding-left: 16px; border-left: 3px solid #d1d5db;">
                    ${originalBody}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============================== -->
          <!-- FOOTER                         -->
          <!-- ============================== -->
          <tr>
            <td style="padding: 24px 36px; border-radius: 0 0 12px 12px; background-color: ${BRAND_GREEN};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.8;">
                    <strong style="color: #ffffff;">Elta Solar ApS</strong> &bull; CVR: 44291028
                    <br />
                    <a href="mailto:ordre@eltasolar.dk" style="color: rgba(255,255,255,0.9); text-decoration: none;">ordre@eltasolar.dk</a>
                    &bull;
                    <a href="https://eltasolar.dk" style="color: rgba(255,255,255,0.9); text-decoration: none;">eltasolar.dk</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Inner container -->

        <!-- Unsubscribe / legal micro-text -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%;">
          <tr>
            <td align="center" style="padding: 16px 0;">
              <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; color: #b0b5bd;">
                Denne email er sendt fra Elta Solar CRM. Svar direkte p&aring; denne email for at kontakte os.
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
