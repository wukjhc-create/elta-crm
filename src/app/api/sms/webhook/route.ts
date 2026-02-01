/**
 * SMS WEBHOOK API ROUTE
 *
 * Handles delivery status callbacks from GatewayAPI
 * https://gatewayapi.com/docs/apis/rest/#delivery-status-notification
 *
 * GatewayAPI sends POST requests with delivery status updates
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleSmsWebhook } from '@/lib/actions/sms'

// GatewayAPI webhook payload structure
interface GatewayApiWebhook {
  id: number // GatewayAPI message ID
  msisdn: number // Phone number
  time: number // Unix timestamp
  status: 'DELIVERED' | 'UNDELIVERED' | 'EXPIRED' | 'REJECTED' | 'UNKNOWN' | 'BUFFERED' | 'ENROUTE'
  error?: string
  code?: string
  userref?: string // Our internal message ID
}

export async function POST(request: NextRequest) {
  try {
    // GatewayAPI sends webhooks as form-urlencoded or JSON
    const contentType = request.headers.get('content-type') || ''

    let payload: GatewayApiWebhook

    if (contentType.includes('application/json')) {
      payload = await request.json()
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      payload = {
        id: parseInt(formData.get('id') as string),
        msisdn: parseInt(formData.get('msisdn') as string),
        time: parseInt(formData.get('time') as string),
        status: formData.get('status') as GatewayApiWebhook['status'],
        error: formData.get('error') as string | undefined,
        code: formData.get('code') as string | undefined,
        userref: formData.get('userref') as string | undefined,
      }
    } else {
      console.error('Unsupported content type:', contentType)
      return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 })
    }

    console.log('SMS webhook received:', payload)

    // Handle the webhook
    const result = await handleSmsWebhook({
      id: payload.id.toString(),
      msisdn: payload.msisdn.toString(),
      status: payload.status,
      time: payload.time,
      error: payload.error,
      code: payload.code,
      userref: payload.userref,
    })

    if (!result.success) {
      console.error('Error handling SMS webhook:', result.error)
      // Still return 200 to acknowledge receipt (GatewayAPI will retry on non-2xx)
    }

    // Return 200 OK to acknowledge receipt
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('SMS webhook error:', error)
    // Return 200 to prevent retries for parsing errors
    return NextResponse.json({ error: 'Internal error' }, { status: 200 })
  }
}

// Also handle GET for webhook verification (some providers use this)
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'SMS webhook endpoint is active',
  })
}
