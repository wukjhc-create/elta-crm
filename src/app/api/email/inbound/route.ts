import { NextRequest, NextResponse } from 'next/server'
import { logIncomingEmail } from '@/lib/actions/email'
import { WEBHOOK_PAYLOAD_LIMITS } from '@/lib/constants'

/**
 * INBOUND EMAIL WEBHOOK
 *
 * Receives forwarded emails from email providers (SendGrid, Mailgun, Postmark, etc.)
 * and logs them to the system.
 *
 * Supported formats:
 * - Generic JSON format (default)
 * - SendGrid Inbound Parse
 * - Mailgun Routes
 * - Postmark Inbound
 */

interface InboundEmailPayload {
  // Generic/Common fields
  from?: string
  from_email?: string
  fromEmail?: string
  From?: string

  from_name?: string
  fromName?: string
  FromName?: string

  to?: string
  to_email?: string
  toEmail?: string
  To?: string

  subject?: string
  Subject?: string

  text?: string
  body_text?: string
  TextBody?: string
  'body-plain'?: string
  'stripped-text'?: string

  html?: string
  body_html?: string
  HtmlBody?: string
  'body-html'?: string
  'stripped-html'?: string

  // Raw email (if available)
  raw?: string
  rawEmail?: string
  RawEmail?: string

  // Message ID for threading
  message_id?: string
  messageId?: string
  MessageID?: string
  'Message-Id'?: string

  // In-Reply-To header for threading
  in_reply_to?: string
  inReplyTo?: string
  'In-Reply-To'?: string

  // References header for threading
  references?: string
  References?: string

  // Attachments (provider-specific, handled separately)
  attachments?: unknown[]
  Attachments?: unknown[]
}

// Extract email address from "Name <email@domain.com>" format
function extractEmail(value: string | undefined): string {
  if (!value) return ''
  const match = value.match(/<([^>]+)>/)
  return match ? match[1] : value.trim()
}

// Extract name from "Name <email@domain.com>" format
function extractName(value: string | undefined): string {
  if (!value) return ''
  const match = value.match(/^([^<]+)</)
  return match ? match[1].trim() : ''
}

// Normalize the payload from different providers
function normalizePayload(payload: InboundEmailPayload) {
  const fromRaw = payload.from || payload.from_email || payload.fromEmail || payload.From || ''
  const toRaw = payload.to || payload.to_email || payload.toEmail || payload.To || ''

  return {
    from_email: extractEmail(fromRaw) || fromRaw,
    from_name: payload.from_name || payload.fromName || payload.FromName || extractName(fromRaw),
    to_email: extractEmail(toRaw) || toRaw,
    subject: payload.subject || payload.Subject || '(Ingen emne)',
    body_text:
      payload.text ||
      payload.body_text ||
      payload.TextBody ||
      payload['body-plain'] ||
      payload['stripped-text'] ||
      '',
    body_html:
      payload.html ||
      payload.body_html ||
      payload.HtmlBody ||
      payload['body-html'] ||
      payload['stripped-html'] ||
      '',
    raw_email: payload.raw || payload.rawEmail || payload.RawEmail,
    message_id:
      payload.message_id ||
      payload.messageId ||
      payload.MessageID ||
      payload['Message-Id'],
    in_reply_to:
      payload.in_reply_to ||
      payload.inReplyTo ||
      payload['In-Reply-To'],
    references: payload.references || payload.References,
  }
}

export async function POST(request: NextRequest) {
  try {
    // Reject oversized payloads (max 5MB for emails with attachments)
    const contentLength = parseInt(request.headers.get('content-length') || '0')
    if (contentLength > WEBHOOK_PAYLOAD_LIMITS.EMAIL) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      )
    }

    // Get content type to handle different formats
    const contentType = request.headers.get('content-type') || ''

    let payload: InboundEmailPayload

    if (contentType.includes('application/json')) {
      // JSON payload
      payload = await request.json()
    } else if (contentType.includes('multipart/form-data')) {
      // Form data (SendGrid, Mailgun)
      const formData = await request.formData()
      payload = Object.fromEntries(formData.entries()) as unknown as InboundEmailPayload
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // URL encoded (some providers)
      const text = await request.text()
      const params = new URLSearchParams(text)
      payload = Object.fromEntries(params.entries()) as unknown as InboundEmailPayload
    } else {
      // Try JSON as fallback
      try {
        payload = await request.json()
      } catch {
        return NextResponse.json(
          { error: 'Unsupported content type' },
          { status: 400 }
        )
      }
    }

    // Normalize the payload
    const normalized = normalizePayload(payload)

    // Validate required fields
    if (!normalized.from_email) {
      return NextResponse.json(
        { error: 'Missing from_email' },
        { status: 400 }
      )
    }

    // Log the incoming email
    const result = await logIncomingEmail({
      from_email: normalized.from_email,
      from_name: normalized.from_name || undefined,
      to_email: normalized.to_email,
      subject: normalized.subject,
      body_text: normalized.body_text || undefined,
      body_html: normalized.body_html || undefined,
      raw_email: normalized.raw_email,
    })

    if (!result.success) {
      console.error('Failed to log incoming email:', result.error)
      return NextResponse.json(
        { error: result.error || 'Failed to process email' },
        { status: 500 }
      )
    }

    // Return success (providers expect 200 OK)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Inbound email webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Some providers send HEAD requests to verify the endpoint
export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}

// Some providers send GET requests for verification
export async function GET(request: NextRequest) {
  // Handle challenge/verification requests
  const searchParams = request.nextUrl.searchParams
  const challenge = searchParams.get('challenge')

  if (challenge) {
    // Return the challenge for verification
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Inbound email webhook is active',
  })
}
