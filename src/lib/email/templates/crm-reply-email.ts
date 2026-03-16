/**
 * CRM Reply Email Template — Professional HTML for outbound emails
 *
 * Fully inline-styled for Outlook, Gmail, Apple Mail compatibility.
 * Uses Elta Solar brand colors (green #16a34a / dark #15803d).
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

  const ctaBlock = ctaUrl
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
      <tr>
        <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);" bgcolor="#16a34a">
          <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; letter-spacing: 0.3px;">
            ${ctaLabel || 'Se dit tilbud'}
          </a>
        </td>
      </tr>
    </table>`
    : ''

  const phoneRow = senderPhone
    ? `<span style="color: #6b7280;">Tlf: </span><a href="tel:${senderPhone}" style="color: #16a34a; text-decoration: none;">${senderPhone}</a><br />`
    : ''

  const emailRow = senderEmail
    ? `<span style="color: #6b7280;">Email: </span><a href="mailto:${senderEmail}" style="color: #16a34a; text-decoration: none;">${senderEmail}</a><br />`
    : ''

  const titleRow = senderTitle
    ? `<span style="color: #6b7280; font-size: 13px;">${senderTitle}</span><br />`
    : ''

  return `<!DOCTYPE html>
<html lang="da" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Elta Solar</title>
  <!--[if mso]>
  <style>body,table,td{font-family:Arial,sans-serif!important;}</style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; -webkit-font-smoothing: antialiased;">
  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <!-- Inner container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%;">

          <!-- Header bar -->
          <tr>
            <td style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 20px 32px; border-radius: 12px 12px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">
                      ELTA SOLAR
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: rgba(255,255,255,0.7);">
                      Professionelle el- &amp; solcelleinstallationer
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #1f2937;">
                    ${messageHtml}
                  </td>
                </tr>
              </table>
              ${ctaBlock}
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="background-color: #ffffff; padding: 0 32px 28px 32px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="border-top: 2px solid #16a34a; padding-top: 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <!-- Green accent bar -->
                        <td style="width: 4px; background-color: #16a34a; border-radius: 2px;" valign="top">&nbsp;</td>
                        <td style="padding-left: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
                          <span style="font-size: 15px; font-weight: 600; color: #1f2937;">${senderName}</span><br />
                          ${titleRow}
                          <span style="font-size: 13px; line-height: 1.8;">
                            ${phoneRow}
                            ${emailRow}
                          </span>
                          <span style="font-size: 13px; font-weight: 600; color: #16a34a;">Elta Solar ApS</span><br />
                          <span style="font-size: 12px; color: #9ca3af;">eltasolar.dk</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Original message -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #9ca3af; margin: 0 0 12px 0;">
                Den ${originalDate} skrev ${originalSender}:
              </p>
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #6b7280; padding-left: 16px; border-left: 3px solid #d1d5db;">
                ${originalBody}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-radius: 0 0 12px 12px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-top: none;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; color: #9ca3af; text-align: center;">
                    Elta Solar ApS &bull; CVR: 44291028 &bull; ordre@eltasolar.dk
                    <br />
                    Denne email er sendt fra Elta Solar CRM
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
