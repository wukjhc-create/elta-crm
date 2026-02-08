'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/types/common.types'
import type {
  Integration,
  IntegrationWithRelations,
  IntegrationWebhook,
  IntegrationEndpoint,
  IntegrationLog,
  IntegrationLogWithRelations,
  ExternalReference,
  CreateIntegrationInput,
  UpdateIntegrationInput,
  CreateWebhookInput,
  UpdateWebhookInput,
  CreateEndpointInput,
  UpdateEndpointInput,
  WebhookEventType,
  WebhookPayload,
  WebhookOfferData,
  WebhookProjectData,
} from '@/types/integrations.types'
import { requireAuth, formatError } from '@/lib/actions/action-helpers'

// =====================================================
// HELPERS
// =====================================================
// =====================================================
// INTEGRATIONS CRUD
// =====================================================

export async function getIntegrations(): Promise<ActionResult<Integration[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .order('name')

    if (error) throw error

    return { success: true, data: data as Integration[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente integrationer') }
  }
}

export async function getIntegration(id: string): Promise<ActionResult<IntegrationWithRelations>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('integrations')
      .select(`
        *,
        webhooks:integration_webhooks(*),
        endpoints:integration_endpoints(*),
        creator:profiles!integrations_created_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Integration ikke fundet' }
      }
      throw error
    }

    return { success: true, data: data as IntegrationWithRelations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente integration') }
  }
}

export async function createIntegration(
  input: CreateIntegrationInput
): Promise<ActionResult<Integration>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('integrations')
      .insert({
        ...input,
        created_by: userId,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as Integration }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette integration') }
  }
}

export async function updateIntegration(
  input: UpdateIntegrationInput
): Promise<ActionResult<Integration>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { id, ...updateData } = input

    const { data, error } = await supabase
      .from('integrations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as Integration }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere integration') }
  }
}

export async function deleteIntegration(id: string): Promise<ActionResult> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette integration') }
  }
}

export async function toggleIntegration(
  id: string,
  isActive: boolean
): Promise<ActionResult<Integration>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('integrations')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as Integration }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke ændre integration status') }
  }
}

// =====================================================
// WEBHOOKS CRUD
// =====================================================

export async function getWebhooks(integrationId: string): Promise<ActionResult<IntegrationWebhook[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('integration_webhooks')
      .select('*')
      .eq('integration_id', integrationId)
      .order('name')

    if (error) throw error

    return { success: true, data: data as IntegrationWebhook[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente webhooks') }
  }
}

export async function createWebhook(
  input: CreateWebhookInput
): Promise<ActionResult<IntegrationWebhook>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('integration_webhooks')
      .insert(input)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as IntegrationWebhook }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette webhook') }
  }
}

export async function updateWebhook(
  input: UpdateWebhookInput
): Promise<ActionResult<IntegrationWebhook>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { id, ...updateData } = input

    const { data, error } = await supabase
      .from('integration_webhooks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as IntegrationWebhook }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere webhook') }
  }
}

export async function deleteWebhook(id: string): Promise<ActionResult> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from('integration_webhooks')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette webhook') }
  }
}

// =====================================================
// ENDPOINTS CRUD
// =====================================================

export async function getEndpoints(integrationId: string): Promise<ActionResult<IntegrationEndpoint[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('integration_endpoints')
      .select('*')
      .eq('integration_id', integrationId)
      .order('name')

    if (error) throw error

    return { success: true, data: data as IntegrationEndpoint[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente endpoints') }
  }
}

export async function createEndpoint(
  input: CreateEndpointInput
): Promise<ActionResult<IntegrationEndpoint>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('integration_endpoints')
      .insert(input)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as IntegrationEndpoint }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette endpoint') }
  }
}

export async function updateEndpoint(
  input: UpdateEndpointInput
): Promise<ActionResult<IntegrationEndpoint>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { id, ...updateData } = input

    const { data, error } = await supabase
      .from('integration_endpoints')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as IntegrationEndpoint }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere endpoint') }
  }
}

export async function deleteEndpoint(id: string): Promise<ActionResult> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from('integration_endpoints')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/dashboard/settings/integrations')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette endpoint') }
  }
}

// =====================================================
// INTEGRATION LOGS
// =====================================================

export async function getIntegrationLogs(
  options?: {
    integrationId?: string
    offerId?: string
    projectId?: string
    limit?: number
  }
): Promise<ActionResult<IntegrationLogWithRelations[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from('integration_logs')
      .select(`
        *,
        integration:integrations(id, name),
        webhook:integration_webhooks(id, name),
        endpoint:integration_endpoints(id, name),
        offer:offers(id, offer_number, title),
        project:projects(id, project_number, name)
      `)
      .order('created_at', { ascending: false })

    if (options?.integrationId) {
      query = query.eq('integration_id', options.integrationId)
    }
    if (options?.offerId) {
      query = query.eq('offer_id', options.offerId)
    }
    if (options?.projectId) {
      query = query.eq('project_id', options.projectId)
    }

    query = query.limit(options?.limit || 100)

    const { data, error } = await query

    if (error) throw error

    return { success: true, data: data as IntegrationLogWithRelations[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente logs') }
  }
}

// =====================================================
// EXTERNAL REFERENCES
// =====================================================

export async function getExternalReferences(
  entityType: string,
  entityId: string
): Promise<ActionResult<ExternalReference[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('external_references')
      .select(`
        *,
        integration:integrations(id, name)
      `)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)

    if (error) throw error

    return { success: true, data: data as ExternalReference[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente eksterne referencer') }
  }
}

// =====================================================
// WEBHOOK TRIGGERING
// =====================================================

/**
 * Trigger webhooks for a specific event
 * This is called internally when events occur (offer accepted, project created, etc.)
 */
export async function triggerWebhooks(
  eventType: WebhookEventType,
  payload: WebhookPayload
): Promise<{ triggered: number; succeeded: number; failed: number }> {
  const supabase = await createClient()

  // Find all active webhooks for this event type
  const { data: webhooks, error: webhookError } = await supabase
    .from('integration_webhooks')
    .select(`
      *,
      integration:integrations(*)
    `)
    .eq('event_type', eventType)
    .eq('is_active', true)

  if (webhookError || !webhooks || webhooks.length === 0) {
    return { triggered: 0, succeeded: 0, failed: 0 }
  }

  // Filter by active integrations
  const activeWebhooks = webhooks.filter(
    (w) => w.integration && (w.integration as Integration).is_active
  )

  let succeeded = 0
  let failed = 0

  // Trigger each webhook
  for (const webhook of activeWebhooks) {
    const integration = webhook.integration as Integration
    const startTime = Date.now()

    try {
      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...integration.default_headers,
        ...webhook.headers,
      }

      // Add authentication
      if (integration.auth_type === 'bearer' && integration.api_key) {
        headers[integration.auth_header_name || 'Authorization'] = `Bearer ${integration.api_key}`
      } else if (integration.auth_type === 'api_key' && integration.api_key) {
        headers[integration.auth_header_name || 'X-API-Key'] = integration.api_key
      } else if (integration.auth_type === 'basic' && integration.api_key && integration.api_secret) {
        const credentials = Buffer.from(`${integration.api_key}:${integration.api_secret}`).toString('base64')
        headers['Authorization'] = `Basic ${credentials}`
      }

      // Build payload (use template if available)
      const requestBody = webhook.payload_template
        ? applyTemplate(webhook.payload_template, payload)
        : payload

      // Send webhook
      const response = await fetch(webhook.url, {
        method: webhook.http_method || 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(integration.timeout_ms || 30000),
      })

      const duration = Date.now() - startTime
      const responseBody = await response.text()

      // Log the result
      await supabase.from('integration_logs').insert({
        integration_id: integration.id,
        webhook_id: webhook.id,
        log_type: 'webhook_sent',
        event_type: eventType,
        offer_id: (payload.data as WebhookOfferData).type === 'offer' ? (payload.data as WebhookOfferData).id : null,
        project_id: (payload.data as WebhookProjectData).type === 'project' ? (payload.data as WebhookProjectData).id : null,
        request_url: webhook.url,
        request_method: webhook.http_method || 'POST',
        request_headers: headers,
        request_body: requestBody as Record<string, unknown>,
        response_status: response.status,
        response_body: tryParseJson(responseBody),
        success: response.ok,
        error_message: response.ok ? null : `HTTP ${response.status}`,
        duration_ms: duration,
      })

      // Update webhook stats
      if (response.ok) {
        succeeded++
        await supabase
          .from('integration_webhooks')
          .update({
            success_count: webhook.success_count + 1,
            last_triggered_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
          })
          .eq('id', webhook.id)
      } else {
        failed++
        await supabase
          .from('integration_webhooks')
          .update({
            failure_count: webhook.failure_count + 1,
            last_triggered_at: new Date().toISOString(),
            last_failure_at: new Date().toISOString(),
            last_error: `HTTP ${response.status}`,
          })
          .eq('id', webhook.id)
      }
    } catch (err) {
      const duration = Date.now() - startTime
      failed++

      // Log the error
      await supabase.from('integration_logs').insert({
        integration_id: integration.id,
        webhook_id: webhook.id,
        log_type: 'error',
        event_type: eventType,
        request_url: webhook.url,
        request_method: webhook.http_method || 'POST',
        success: false,
        error_message: err instanceof Error ? err.message : 'Unknown error',
        duration_ms: duration,
      })

      // Update webhook stats
      await supabase
        .from('integration_webhooks')
        .update({
          failure_count: webhook.failure_count + 1,
          last_triggered_at: new Date().toISOString(),
          last_failure_at: new Date().toISOString(),
          last_error: err instanceof Error ? err.message : 'Unknown error',
        })
        .eq('id', webhook.id)
    }
  }

  return { triggered: activeWebhooks.length, succeeded, failed }
}

/**
 * Build webhook payload for an offer event
 */
export async function buildOfferWebhookPayload(
  offerId: string,
  eventType: WebhookEventType
): Promise<WebhookPayload | null> {
  const supabase = await createClient()

  const { data: offer, error } = await supabase
    .from('offers')
    .select(`
      *,
      customer:customers(id, company_name, contact_person, email),
      line_items:offer_line_items(description, quantity, unit, unit_price, total)
    `)
    .eq('id', offerId)
    .single()

  if (error || !offer) return null

  const payload: WebhookPayload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data: {
      type: 'offer',
      id: offer.id,
      offer_number: offer.offer_number,
      title: offer.title,
      status: offer.status,
      customer: offer.customer,
      total_amount: offer.total_amount,
      final_amount: offer.final_amount,
      currency: offer.currency,
      line_items: offer.line_items,
      created_at: offer.created_at,
      accepted_at: offer.accepted_at,
      rejected_at: offer.rejected_at,
    },
  }

  return payload
}

/**
 * Build webhook payload for a project event
 */
export async function buildProjectWebhookPayload(
  projectId: string,
  eventType: WebhookEventType
): Promise<WebhookPayload | null> {
  const supabase = await createClient()

  const { data: project, error } = await supabase
    .from('projects')
    .select(`
      *,
      customer:customers(id, company_name),
      offer:offers(id, offer_number)
    `)
    .eq('id', projectId)
    .single()

  if (error || !project) return null

  const payload: WebhookPayload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data: {
      type: 'project',
      id: project.id,
      project_number: project.project_number,
      name: project.name,
      status: project.status,
      priority: project.priority,
      customer: project.customer,
      offer: project.offer,
      budget: project.budget,
      start_date: project.start_date,
      end_date: project.end_date,
      created_at: project.created_at,
    },
  }

  return payload
}

// =====================================================
// MANUAL EXPORT
// =====================================================

/**
 * Manually export an offer to a specific integration
 */
export async function exportOfferToIntegration(
  offerId: string,
  integrationId: string
): Promise<ActionResult<{ externalId?: string }>> {
  try {
    const userId = await requireAuth()
    const supabase = await createClient()

    // Get integration
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (intError || !integration) {
      return { success: false, error: 'Integration ikke fundet' }
    }

    if (!integration.is_active) {
      return { success: false, error: 'Integration er ikke aktiv' }
    }

    // Get endpoint for create_order
    const { data: endpoint } = await supabase
      .from('integration_endpoints')
      .select('*')
      .eq('integration_id', integrationId)
      .eq('operation', 'create_order')
      .eq('is_active', true)
      .single()

    if (!endpoint) {
      return { success: false, error: 'Ingen aktiv endpoint for ordre-oprettelse' }
    }

    // Build payload
    const payload = await buildOfferWebhookPayload(offerId, 'offer.accepted')
    if (!payload) {
      return { success: false, error: 'Kunne ikke bygge payload' }
    }

    const startTime = Date.now()

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...integration.default_headers,
    }

    // Add auth
    if (integration.auth_type === 'bearer' && integration.api_key) {
      headers[integration.auth_header_name || 'Authorization'] = `Bearer ${integration.api_key}`
    }

    // Build request body
    const requestBody = endpoint.request_template
      ? applyTemplate(endpoint.request_template, payload)
      : payload

    // Send request
    const url = `${integration.base_url}${endpoint.endpoint_path}`
    const response = await fetch(url, {
      method: endpoint.http_method || 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    const duration = Date.now() - startTime
    const responseText = await response.text()
    const responseBody = tryParseJson(responseText)

    // Log the result
    await supabase.from('integration_logs').insert({
      integration_id: integrationId,
      endpoint_id: endpoint.id,
      log_type: 'api_call',
      event_type: 'offer.accepted',
      offer_id: offerId,
      request_url: url,
      request_method: endpoint.http_method || 'POST',
      request_headers: headers,
      request_body: requestBody as Record<string, unknown>,
      response_status: response.status,
      response_body: responseBody,
      success: response.ok,
      error_message: response.ok ? null : `HTTP ${response.status}`,
      duration_ms: duration,
      triggered_by: userId,
    })

    if (!response.ok) {
      return { success: false, error: `Eksport fejlede: HTTP ${response.status}` }
    }

    // Extract external ID from response if mapping exists
    let externalId: string | undefined
    if (endpoint.response_mapping && responseBody) {
      const mapping = endpoint.response_mapping as Record<string, string>
      if (mapping.external_id) {
        const value = getNestedValue(responseBody as Record<string, unknown>, mapping.external_id)
        externalId = value != null ? String(value) : undefined
      }
    }

    // Save external reference
    if (externalId) {
      await supabase.from('external_references').upsert({
        integration_id: integrationId,
        entity_type: 'offer',
        entity_id: offerId,
        external_id: externalId,
        last_synced_at: new Date().toISOString(),
        sync_status: 'synced',
        external_data: responseBody,
      })
    }

    return { success: true, data: { externalId } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke eksportere tilbud') }
  }
}

/**
 * Test integration connection
 */
export async function testIntegrationConnection(
  integrationId: string
): Promise<ActionResult<{ status: number; message: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: integration, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (error || !integration) {
      return { success: false, error: 'Integration ikke fundet' }
    }

    if (!integration.base_url) {
      return { success: false, error: 'Ingen base URL konfigureret' }
    }

    // Build headers
    const headers: Record<string, string> = {
      ...integration.default_headers,
    }

    if (integration.auth_type === 'bearer' && integration.api_key) {
      headers[integration.auth_header_name || 'Authorization'] = `Bearer ${integration.api_key}`
    }

    // Try a simple GET request to base URL
    const response = await fetch(integration.base_url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    })

    // Update last sync time
    await supabase
      .from('integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: response.ok ? null : `HTTP ${response.status}`,
        error_count: response.ok ? 0 : integration.error_count + 1,
      })
      .eq('id', integrationId)

    return {
      success: true,
      data: {
        status: response.status,
        message: response.ok ? 'Forbindelse OK' : `HTTP ${response.status}`,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Forbindelse fejlede',
    }
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function applyTemplate(
  template: Record<string, unknown>,
  data: WebhookPayload
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(template)) {
    if (typeof value === 'string') {
      // Replace {{variable}} with actual values
      result[key] = value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const val = getNestedValue(data as unknown as Record<string, unknown>, path.trim())
        return val !== undefined ? String(val) : ''
      })
    } else if (typeof value === 'object' && value !== null) {
      result[key] = applyTemplate(value as Record<string, unknown>, data)
    } else {
      result[key] = value
    }
  }

  return result
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj

  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    current = (current as Record<string, unknown>)[key]
  }

  return current
}
