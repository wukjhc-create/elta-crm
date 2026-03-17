/**
 * Internal notification email — sent to employee when customer accepts/rejects an offer
 */
import { BRAND_GREEN, BRAND_GREEN_DARK, BRAND_ORANGE } from '@/lib/brand'

interface OfferNotificationParams {
  action: 'accepted' | 'rejected'
  customerName: string
  companyName: string
  offerNumber: string
  offerTitle: string
  finalAmount: string
  accepterName?: string
  offerUrl: string
}

export function generateOfferNotificationHtml({
  action,
  customerName,
  companyName,
  offerNumber,
  offerTitle,
  finalAmount,
  accepterName,
  offerUrl,
}: OfferNotificationParams): string {
  const isAccepted = action === 'accepted'
  const statusColor = isAccepted ? BRAND_GREEN : '#dc2626'
  const statusText = isAccepted ? 'ACCEPTERET' : 'AFVIST'
  const statusEmoji = isAccepted ? '&#10004;' : '&#10008;'
  const message = isAccepted
    ? `<strong>${accepterName || customerName}</strong> fra ${companyName} har accepteret tilbuddet.`
    : `${customerName} fra ${companyName} har afvist tilbuddet.`

  return `<!DOCTYPE html>
<html lang="da">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">

<tr><td style="height:4px;background-color:${BRAND_ORANGE};"></td></tr>
<tr><td style="background-color:${BRAND_GREEN};padding:20px 32px;">
  <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:1px;">&#9788; ELTA SOLAR</span>
</td></tr>

<tr><td style="padding:32px;text-align:center;">
  <div style="display:inline-block;width:64px;height:64px;line-height:64px;border-radius:50%;background-color:${statusColor};color:#ffffff;font-size:28px;margin-bottom:16px;">${statusEmoji}</div>
  <h1 style="margin:0 0 8px;color:${statusColor};font-size:24px;">Tilbud ${statusText}</h1>
  <p style="margin:0 0 24px;color:#666;font-size:15px;">${message}</p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 24px;">
    <tr><td style="padding:12px 16px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">
      <span style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Tilbudsdetaljer</span>
    </td></tr>
    <tr><td style="padding:16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;color:#888;font-size:13px;width:100px;">Titel:</td><td style="padding:4px 0;color:#333;font-size:13px;font-weight:bold;">${offerTitle}</td></tr>
        <tr><td style="padding:4px 0;color:#888;font-size:13px;">Nummer:</td><td style="padding:4px 0;color:#333;font-size:13px;">${offerNumber}</td></tr>
        <tr><td style="padding:4px 0;color:#888;font-size:13px;">Kunde:</td><td style="padding:4px 0;color:#333;font-size:13px;">${companyName}</td></tr>
        <tr><td style="padding:4px 0;color:#888;font-size:13px;">Beløb:</td><td style="padding:4px 0;color:${BRAND_GREEN};font-size:16px;font-weight:bold;">${finalAmount}</td></tr>
      </table>
    </td></tr>
  </table>

  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td style="border-radius:8px;background-color:${BRAND_GREEN};">
    <a href="${offerUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;border-radius:8px;">
      &Aring;bn tilbud i CRM &rarr;
    </a>
  </td></tr>
  </table>
</td></tr>

<tr><td style="background-color:${BRAND_GREEN_DARK};padding:16px 32px;text-align:center;">
  <span style="color:rgba(255,255,255,0.6);font-size:11px;">Elta Solar ApS &bull; Automatisk notifikation</span>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}
