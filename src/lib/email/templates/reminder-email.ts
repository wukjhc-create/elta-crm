/**
 * Follow-up / Reminder Email Template
 *
 * Simple, clean HTML. No Outlook hacks. No complex table-based buttons.
 * Uses Elta Solar brand colors from brand.ts.
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
  const intro = reminderCount <= 1
    ? `Vi ville h&oslash;re, om du har haft mulighed for at gennemg&aring; vores tilbud <strong>${offerTitle}</strong> (${offerNumber}).`
    : `Vi f&oslash;lger op p&aring; vores tilbud <strong>${offerTitle}</strong> (${offerNumber}), som vi sendte for noget tid siden.`

  const urgency = validUntil
    ? `<p style="margin:0 0 16px;color:#666666;font-size:14px;line-height:1.6;">Tilbuddet er gyldigt til <strong>${validUntil}</strong>.</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>P&aring;mindelse</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:24px 16px;">

<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">

<!-- Orange accent -->
<tr><td style="height:4px;background-color:${BRAND_ORANGE};"></td></tr>

<!-- Green header -->
<tr><td style="background-color:${BRAND_GREEN};padding:28px 32px;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:1px;">
&#9788; ELTA SOLAR
</td></tr>

<!-- Body -->
<tr><td style="padding:32px;">

<p style="margin:0 0 16px;color:#333333;font-size:16px;line-height:1.6;">K&aelig;re ${customerName},</p>
<p style="margin:0 0 16px;color:#666666;font-size:14px;line-height:1.6;">${intro}</p>
${urgency}

<!-- Offer summary -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e8f5e8;border-radius:8px;overflow:hidden;">
<tr><td style="background-color:#e8f5e8;padding:12px 16px;color:${BRAND_GREEN};font-weight:bold;font-size:14px;">Tilbudsoversigt</td></tr>
<tr><td style="padding:16px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;color:#888;font-size:13px;width:120px;">Tilbud:</td><td style="padding:4px 0;color:#333;font-size:13px;font-weight:bold;">${offerTitle}</td></tr>
<tr><td style="padding:4px 0;color:#888;font-size:13px;">Nummer:</td><td style="padding:4px 0;color:#333;font-size:13px;">${offerNumber}</td></tr>
<tr><td style="padding:4px 0;color:#888;font-size:13px;">Total:</td><td style="padding:4px 0;color:${BRAND_GREEN};font-size:16px;font-weight:bold;">${finalAmount}</td></tr>
</table>
</td></tr>
</table>

<p style="margin:0 0 24px;color:#666666;font-size:14px;line-height:1.6;">
Klik p&aring; knappen herunder for at se tilbuddet:
</p>

<!-- Button: simple <a> tag, no tables, no hacks -->
<p style="text-align:center;margin:0 0 24px;">
<a href="${portalUrl}" target="_blank" style="background-color:#2e7d32;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;font-size:16px;font-family:Arial,Helvetica,sans-serif;">Se dit tilbud her &#8594;</a>
</p>

<p style="margin:0;color:#999999;font-size:12px;text-align:center;">
Har du sp&oslash;rgsm&aring;l? Svar bare p&aring; denne mail.
</p>

</td></tr>

<!-- Footer -->
<tr><td style="background-color:${BRAND_GREEN_DARK};padding:20px 32px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="color:rgba(255,255,255,0.9);font-size:13px;font-family:Arial,Helvetica,sans-serif;">
<strong>${senderName}</strong><br>
<span style="color:rgba(255,255,255,0.6);font-size:12px;">Elta Solar ApS</span>
</td>
<td align="right" style="color:rgba(255,255,255,0.6);font-size:12px;font-family:Arial,Helvetica,sans-serif;">
kontakt@eltasolar.dk<br>eltasolar.dk
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
