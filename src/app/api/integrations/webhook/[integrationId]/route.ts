import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { WEBHOOK_PAYLOAD_LIMITS } from '@/lib/constants'
import { logger } from '@/lib/utils/logger'
import { isValidOfferTransition, type OfferStatus } from '@/types/offers.types'

export const dynamic = 'force-dynamic'

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

    // Q10: fail-closed — før var en integration uden api_key helt uden godkendelse (enhver med integrations-id'et
    // kunne sætte status på vilkårlige tilbud/projekter)
    if (!integration.api_key) {
      // Partner-review 2026-10-08: fejlet godkendelse logges ikke i DB (spam-vektor); kun applikationslog
      logger.warn('integration webhook: unauthorized', { entityId: integrationId, metadata: { reason: 'Integration has no API key configured' } })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    {
      if (!authHeader) {
        // Partner-review 2026-10-08: fejlet godkendelse logges ikke i DB (spam-vektor); kun applikationslog
      logger.warn('integration webhook: unauthorized', { entityId: integrationId, metadata: { reason: 'Missing authentication header' } })

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
        // Partner-review 2026-10-08: fejlet godkendelse logges ikke i DB (spam-vektor); kun applikationslog
      logger.warn('integration webhook: unauthorized', { entityId: integrationId, metadata: { reason: 'Invalid API key' } })

        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    // Reject oversized payloads (max 1MB)
    const contentLength = parseInt(request.headers.get('content-length') || '0')
    if (contentLength > WEBHOOK_PAYLOAD_LIMITS.INTEGRATION) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      )
    }

    // Parse payload
    let payload: WebhookPayload
    const contentType = request.headers.get('content-type') || ''

    // Partner-review 2026-10-08: læs kroppen med hård grænse (Content-Length kan mangle ved chunked upload)
    const rawBuf = await request.arrayBuffer()
    if (rawBuf.byteLength > WEBHOOK_PAYLOAD_LIMITS.INTEGRATION) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    const rawText = new TextDecoder().decode(rawBuf)
    try {
      payload = contentType.includes('application/x-www-form-urlencoded')
        ? (Object.fromEntries(new URLSearchParams(rawText).entries()) as unknown as WebhookPayload)
        : (JSON.parse(rawText) as WebhookPayload)
    } catch {
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 })
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

    // Partner-review 2026-10-08 (S2): rå offer_id/project_id/numre blev brugt direkte → enhver integration kunne ændre
    // status på VILKÅRLIGE tilbud. Nu: kun entiteter som DENNE integration har en external_reference til.
    const ownsEntity = async (entityType: 'offer' | 'project', entityId: string) => {
      const { data } = await supabase.from('external_references').select('id')
        .eq('integration_id', integrationId).eq('entity_type', entityType).eq('entity_id', entityId).limit(1).maybeSingle()
      return !!data
    }
    if (!offerId && (payload.offer_id || payload.offer_number)) {
      const q = supabase.from('offers').select('id')
      const { data: offer } = payload.offer_id ? await q.eq('id', payload.offer_id).maybeSingle() : await q.eq('offer_number', payload.offer_number).maybeSingle()
      if (offer && (await ownsEntity('offer', offer.id))) offerId = offer.id
    }
    if (!projectId && (payload.project_id || payload.project_number)) {
      const q = supabase.from('projects').select('id')
      const { data: project } = payload.project_id ? await q.eq('id', payload.project_id).maybeSingle() : await q.eq('project_number', payload.project_number).maybeSingle()
      if (project && (await ownsEntity('project', project.id))) projectId = project.id
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
        // Partner-review 2026-10-08: aldrig 'draft' (ville genåbne et sendt/accepteret tilbud forbi redigeringslåsen)
        // eller 'accepted' (accept kræver kundens underskrift i portalen); kun gyldige overgange, betinget opdatering
        const { data: cur } = await supabase.from('offers').select('status').eq('id', offerId).maybeSingle()
        const curStatus = (cur as { status: string } | null)?.status
        const allowed = !!mappedStatus && !!curStatus && mappedStatus !== 'draft' && mappedStatus !== 'accepted'
          && isValidOfferTransition(curStatus as OfferStatus, mappedStatus as OfferStatus)
        if (allowed) {
          const { data: upd, error } = await supabase
            .from('offers')
            .update({ status: mappedStatus })
            .eq('id', offerId)
            .eq('status', curStatus)
            .select('id')

          if (!error && (upd ?? []).length === 1) {
            processed = true
            updateResult = { entity: 'offer', id: offerId, status: mappedStatus }
          }
        } else if (mappedStatus) {
          updateResult = { entity: 'offer', id: offerId, status: curStatus, ignored: `overgang ${curStatus} → ${mappedStatus} ikke tilladt via webhook` }
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
    logger.error('Webhook processing error', { error })

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
