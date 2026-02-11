import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'

/**
 * INBOUND WEBHOOK ENDPOINT
 *
 * Receives updates from external systems.
 * URL format: /api/integrations/webhook/[integrationId]
 *
 * External systems can POST updates about:
 * - Order status changes
 * - Invoice creation
 * - Custom events
 */

// Create a service role client for bypassing RLS
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration for webhook handler')
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

interface WebhookPayload {
  event?: string
  event_type?: string
  type?: string

  // Reference to local entity
  offer_id?: string
  offer_number?: string
  project_id?: string
  project_number?: string
  external_id?: string

  // Status updates
  status?: string
  new_status?: string

  // Generic data
  data?: Record<string, unknown>

  // Timestamp
  timestamp?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const startTime = Date.now()
  const { integrationId } = await params

  try {
    const supabase = getServiceClient()

    // Verify integration exists and is active
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('id, name, is_active, api_key')
      .eq('id', integrationId)
      .single()

    if (intError || !integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      )
    }

    if (!integration.is_active) {
      return NextResponse.json(
        { error: 'Integration is disabled' },
        { status: 403 }
      )
    }

    // Verify webhook signature/API key
    const authHeader = request.headers.get('Authorization') ||
                       request.headers.get('X-API-Key') ||
                       request.headers.get('X-Webhook-Secret')

    if (integration.api_key) {
      if (!authHeader) {
        await logWebhook(supabase, integrationId, {
          success: false,
          error_message: 'Missing authentication header',
          response_status: 401,
          duration_ms: Date.now() - startTime,
        })

        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      const providedKey = authHeader.replace('Bearer ', '')
      const expected = Buffer.from(integration.api_key)
      const provided = Buffer.from(providedKey)
      const keysMatch = expected.length === provided.length &&
        timingSafeEqual(expected, provided)
      if (!keysMatch) {
        await logWebhook(supabase, integrationId, {
          success: false,
          error_message: 'Invalid API key',
          response_status: 401,
          duration_ms: Date.now() - startTime,
        })

        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    // Reject oversized payloads (max 1MB)
    const contentLength = parseInt(request.headers.get('content-length') || '0')
    if (contentLength > 1_048_576) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      )
    }

    // Parse payload
    let payload: WebhookPayload
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      payload = await request.json()
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      payload = Object.fromEntries(formData.entries()) as unknown as WebhookPayload
    } else {
      try {
        payload = await request.json()
      } catch {
        return NextResponse.json(
          { error: 'Invalid payload format' },
          { status: 400 }
        )
      }
    }

    // Determine event type
    const eventType = payload.event || payload.event_type || payload.type || 'unknown'

    // Find related local entity
    let offerId: string | null = null
    let projectId: string | null = null

    // If external_id is provided, look up the local entity
    if (payload.external_id) {
      const { data: extRef } = await supabase
        .from('external_references')
        .select('entity_type, entity_id')
        .eq('integration_id', integrationId)
        .eq('external_id', payload.external_id)
        .single()

      if (extRef) {
        if (extRef.entity_type === 'offer') offerId = extRef.entity_id
        if (extRef.entity_type === 'project') projectId = extRef.entity_id
      }
    }

    // Direct ID references
    if (payload.offer_id) offerId = payload.offer_id
    if (payload.project_id) projectId = payload.project_id

    // Look up by number if provided
    if (!offerId && payload.offer_number) {
      const { data: offer } = await supabase
        .from('offers')
        .select('id')
        .eq('offer_number', payload.offer_number)
        .single()
      if (offer) offerId = offer.id
    }

    if (!projectId && payload.project_number) {
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('project_number', payload.project_number)
        .single()
      if (project) projectId = project.id
    }

    // Process the webhook based on event type
    let processed = false
    let updateResult: unknown = null

    // Handle status updates
    const newStatus = payload.status || payload.new_status
    if (newStatus) {
      if (offerId) {
        // Update offer status (map external status if needed)
        const mappedStatus = mapExternalStatus(newStatus, 'offer')
        if (mappedStatus) {
          const { error } = await supabase
            .from('offers')
            .update({ status: mappedStatus })
            .eq('id', offerId)

          if (!error) {
            processed = true
            updateResult = { entity: 'offer', id: offerId, status: mappedStatus }
          }
        }
      }

      if (projectId) {
        // Update project status
        const mappedStatus = mapExternalStatus(newStatus, 'project')
        if (mappedStatus) {
          const { error } = await supabase
            .from('projects')
            .update({ status: mappedStatus })
            .eq('id', projectId)

          if (!error) {
            processed = true
            updateResult = { entity: 'project', id: projectId, status: mappedStatus }
          }
        }
      }
    }

    // Log the webhook
    const duration = Date.now() - startTime
    await logWebhook(supabase, integrationId, {
      event_type: eventType,
      offer_id: offerId,
      project_id: projectId,
      request_body: payload,
      success: true,
      duration_ms: duration,
    })

    return NextResponse.json({
      success: true,
      processed,
      result: updateResult,
      message: processed ? 'Webhook processed' : 'Webhook received',
    })
  } catch (error) {
    console.error('Webhook processing error:', error)

    // Try to log the error
    try {
      const supabase = getServiceClient()
      await logWebhook(supabase, integrationId, {
        success: false,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      })
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Also support GET for verification
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params

  // Handle challenge/verification - sanitize to prevent XSS
  const challenge = request.nextUrl.searchParams.get('challenge')
  if (challenge) {
    const sanitized = challenge.replace(/[^a-zA-Z0-9_\-\.]/g, '')
    return new NextResponse(sanitized, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return NextResponse.json({
    status: 'ok',
    integration_id: integrationId,
    message: 'Webhook endpoint is active',
  })
}

// Helper to log webhook
async function logWebhook(
  supabase: ReturnType<typeof getServiceClient>,
  integrationId: string,
  data: {
    event_type?: string
    offer_id?: string | null
    project_id?: string | null
    request_body?: unknown
    success: boolean
    error_message?: string
    duration_ms: number
    response_status?: number
  }
) {
  await supabase.from('integration_logs').insert({
    integration_id: integrationId,
    log_type: 'webhook_received',
    event_type: data.event_type,
    offer_id: data.offer_id,
    project_id: data.project_id,
    request_body: data.request_body as Record<string, unknown>,
    response_status: data.response_status,
    success: data.success,
    error_message: data.error_message,
    duration_ms: data.duration_ms,
  })
}

// Map external status to internal status
function mapExternalStatus(
  externalStatus: string,
  entityType: 'offer' | 'project'
): string | null {
  const statusLower = externalStatus.toLowerCase()

  if (entityType === 'offer') {
    // Map common external statuses to offer statuses
    if (['accepted', 'confirmed', 'approved'].includes(statusLower)) return 'accepted'
    if (['rejected', 'declined', 'cancelled'].includes(statusLower)) return 'rejected'
    if (['sent', 'delivered'].includes(statusLower)) return 'sent'
    if (['viewed', 'opened', 'read'].includes(statusLower)) return 'viewed'
    if (['expired'].includes(statusLower)) return 'expired'
    if (['draft', 'pending'].includes(statusLower)) return 'draft'
  }

  if (entityType === 'project') {
    // Map common external statuses to project statuses
    if (['active', 'in_progress', 'started'].includes(statusLower)) return 'active'
    if (['completed', 'done', 'finished'].includes(statusLower)) return 'completed'
    if (['cancelled', 'canceled', 'aborted'].includes(statusLower)) return 'cancelled'
    if (['on_hold', 'paused', 'hold'].includes(statusLower)) return 'on_hold'
    if (['planning', 'planned', 'pending'].includes(statusLower)) return 'planning'
  }

  return null
}
