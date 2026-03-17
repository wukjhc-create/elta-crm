/**
 * Follow-up / Reminder Email Template
 *
 * Fully inline-styled for Outlook, Gmail, Apple Mail compatibility.
 * Table-based layout. Uses Elta Solar brand colors from brand.ts.
 */
import { BRAND_GREEN, BRAND_GREEN_DARK, BRAND_ORANGE } from '@/lib/brand'

interface ReminderEmailParams {
  customerName: string
  companyName: string
  offerNumber: string
  offerTitle: string
  finalAmount: string
  validUntil: string | null
  portalUrl: string
  senderName: string
  reminderCount: number
}

export function generateReminderEmailHtml({
  customerName,
  companyName,
  offerNumber,
  offerTitle,
  finalAmount,
  validUntil,
  portalUrl,
  senderName,
  reminderCount,
}: ReminderEmailParams): string {
  const greeting = reminderCount <= 1
    ? `Kære ${customerName}`
    : `Kære ${customerName}`

  const intro = reminderCount <= 1
    ? `Vi ville høre, om du har haft mulighed for at gennemgå vores tilbud <strong>${offerTitle}</strong> (${offerNumber}).`
    : `Vi følger op på vores tilbud <strong>${offerTitle}</strong> (${offerNumber}), som vi sendte for noget tid siden.`

  const urgency = validUntil
    ? `<p style="margin:0 0 16px;color:#666666;font-size:14px;line-height:1.6;">Tilbuddet er gyldigt til <strong>${validUntil}</strong>. Vi vil gerne sikre, at du når at benytte dig af det.</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="da" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Påmindelse — ${offerTitle}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:24px 16px;">

<!-- Container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<!-- Orange accent -->
<tr><td style="height:4px;background-color:${BRAND_ORANGE};"></td></tr>

<!-- Green header -->
<tr><td style="background-color:${BRAND_GREEN};padding:28px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:1px;">&#9788; ELTA SOLAR</td>
    <td align="right" style="color:rgba(255,255,255,0.7);font-size:12px;letter-spacing:1px;">P&Aring;MINDELSE</td>
  </tr>
  </table>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px;">
  <p style="margin:0 0 16px;color:#333333;font-size:16px;line-height:1.6;">${greeting},</p>
  <p style="margin:0 0 16px;color:#666666;font-size:14px;line-height:1.6;">${intro}</p>
  ${urgency}

  <!-- Offer summary box -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8f5e8;border-radius:8px;overflow:hidden;">
    <tr><td style="background-color:#e8f5e8;padding:12px 16px;">
      <span style="color:${BRAND_GREEN};font-weight:bold;font-size:14px;">Tilbudsoversigt</span>
    </td></tr>
    <tr><td style="padding:16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#888;font-size:13px;width:120px;">Tilbud:</td>
          <td style="padding:4px 0;color:#333;font-size:13px;font-weight:bold;">${offerTitle}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#888;font-size:13px;">Nummer:</td>
          <td style="padding:4px 0;color:#333;font-size:13px;">${offerNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#888;font-size:13px;">Total:</td>
          <td style="padding:4px 0;color:${BRAND_GREEN};font-size:16px;font-weight:bold;">${finalAmount}</td>
        </tr>
      </table>
    </td></tr>
  </table>

  <p style="margin:0 0 24px;color:#666666;font-size:14px;line-height:1.6;">
    Klik på knappen herunder for at se tilbuddet i detaljer, stille spørgsmål eller acceptere direkte:
  </p>

  <!-- CTA Button -->
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td align="center" style="border-radius:8px;background-color:${BRAND_GREEN};">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${portalUrl}" style="height:56px;v-text-anchor:middle;width:380px;" arcsize="14%" strokecolor="${BRAND_GREEN}" fillcolor="${BRAND_GREEN}"><v:textbox inset="0,0,0,0"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;">&#9788; Se dit personlige solcelletilbud</center></v:textbox></v:roundrect><![endif]-->
    <!--[if !mso]><!-->
    <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:17px 44px;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;border-radius:8px;background-color:${BRAND_GREEN};letter-spacing:0.3px;box-shadow:0 4px 14px rgba(45,138,45,0.35);">
      &#9788;&nbsp; Se dit personlige solcelletilbud
    </a>
    <!--<![endif]-->
  </td></tr>
  </table>

  <p style="margin:24px 0 0;color:#999999;font-size:12px;text-align:center;">
    Har du spørgsmål? Svar bare på denne mail, så vender vi hurtigt tilbage.
  </p>
</td></tr>

<!-- Footer -->
<tr><td style="background-color:${BRAND_GREEN_DARK};padding:20px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="color:rgba(255,255,255,0.9);font-size:13px;">
      <strong>${senderName}</strong><br>
      <span style="color:rgba(255,255,255,0.6);font-size:12px;">Elta Solar ApS &bull; CVR: 44291028</span>
    </td>
    <td align="right" style="color:rgba(255,255,255,0.6);font-size:12px;">
      ordre@eltasolar.dk<br>eltasolar.dk
    </td>
  </tr>
  </table>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

export function generateReminderEmailText({
  customerName,
  offerNumber,
  offerTitle,
  finalAmount,
  validUntil,
  portalUrl,
  senderName,
}: ReminderEmailParams): string {
  return `Kære ${customerName},

Vi ville høre, om du har haft mulighed for at gennemgå vores tilbud "${offerTitle}" (${offerNumber}).

Tilbud: ${offerTitle}
Nummer: ${offerNumber}
Total: ${finalAmount}
${validUntil ? `Gyldigt til: ${validUntil}` : ''}

Se tilbuddet her: ${portalUrl}

Har du spørgsmål? Svar bare på denne mail.

Med venlig hilsen,
${senderName}
Elta Solar ApS`
}
