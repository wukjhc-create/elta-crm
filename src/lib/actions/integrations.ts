'use server'

import { revalidatePath } from 'next/cache'
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
import {
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
  formatError,
} from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'

/**
 * RBAC app-lag (P-006): actions med EKSTERN effekt/adgang (portal-/partner-tokens, integrationer, afsendelse)
 * var ugatede — enhver indlogget kunne kalde dem direkte. Kraever nu den relevante rettighed.
 */
async function requireGate(permission: Permission) {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission(permission)
  return ctx
}
import { validateUUID } from '@/lib/validations/common'
import { secretColumnReader } from '@/lib/portal/token-reader'
import { applyTemplate, tryParseJson, getNestedValue, buildOfferWebhookPayload } from '@/lib/services/webhook-dispatch'
import { logger } from '@/lib/utils/logger'
import {
  encryptIntegrationSecrets,
  decryptIntegrationSecrets,
  maskIntegrationSecrets,
  INTEGRATION_SECRET_FIELDS,
  redactSecretHeaders,
} from '@/lib/services/integration-secrets'

// =====================================================
// HELPERS
// =====================================================

/**
 * Sprint 7 Pilot — alle user-facing integration CRUD actions kraever
 * settings.economic. Internal helpers (triggerWebhooks, buildXxxPayload,
 * getExternalReferences) forbliver authenticated-only saa eksisterende
 * offer/invoice flows ikke brydes naar de kaldes af salg/serviceleder
 * under fx tilbudsaccept.
 */
async function checkIntegrationAccess(): Promise<boolean> {
  const { hasPermission } = await getAuthenticatedClientWithRole()
  return hasPermission('settings.economic')
}

const PERM_DENIED_INTEGRATION = { success: false as const, error: 'Manglende tilladelse: settings.economic' }

// =====================================================
// INTEGRATIONS CRUD
// =====================================================

export async function getIntegrations(): Promise<ActionResult<Integration[]>> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await (await secretColumnReader())
      .from('integrations')
      .select('*')
      .order('name')

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Returnér aldrig hemmeligheder i klartekst til browseren.
    const masked = (data as Integration[]).map(maskIntegrationSecrets)
    return { success: true, data: masked }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente integrationer') }
  }
}

export async function getIntegration(id: string): Promise<ActionResult<IntegrationWithRelations>> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    validateUUID(id, 'integration ID')
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await (await secretColumnReader())
      .from('integrations')
      .select(`
        *,
        webhooks:integration_webhooks(*),
        endpoints:integration_endpoints(*),
        creator:profiles!integrations_created_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return { success: false, error: 'Integration ikke fundet' }
    }

    // Masker secrets; relationer (webhooks/endpoints/creator) bevares.
    const masked = maskIntegrationSecrets(data as Integration) as IntegrationWithRelations
    return { success: true, data: masked }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente integration') }
  }
}

export async function createIntegration(
  input: CreateIntegrationInput
): Promise<ActionResult<Integration>> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase, userId } = await requireGate('settings.manage')

    // Krypter secret-felter foer lagring (AES-256-GCM, enc:v1:-prefix).
    const encryptedInput = await encryptIntegrationSecrets(input)

    const { data, error } = await (await secretColumnReader())
      .from('integrations')
      .insert({
        ...encryptedInput,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: maskIntegrationSecrets(data as Integration) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette integration') }
  }
}

export async function updateIntegration(
  input: UpdateIntegrationInput
): Promise<ActionResult<Integration>> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await requireGate('settings.manage')

    const { id, ...updateData } = input

    // Hent eksisterende ciphertext, saa tomme secret-felter bevares (bevar-
    // hvis-tom) i stedet for at blive nullet.
    const { data: existing } = await (await secretColumnReader())
      .from('integrations')
      .select(INTEGRATION_SECRET_FIELDS.join(','))
      .eq('id', id)
      .maybeSingle()

    const encryptedUpdate = await encryptIntegrationSecrets(
      updateData,
      existing as Partial<Record<(typeof INTEGRATION_SECRET_FIELDS)[number], string | null>> | null
    )

    const { data, error } = await (await secretColumnReader())
      .from('integrations')
      .update(encryptedUpdate)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: maskIntegrationSecrets(data as Integration) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere integration') }
  }
}

export async function deleteIntegration(id: string): Promise<ActionResult> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    validateUUID(id, 'integration ID')
    const { supabase } = await requireGate('settings.manage')

    const { error } = await (await secretColumnReader())
      .from('integrations')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

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
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await requireGate('settings.manage')

    const { data, error } = await (await secretColumnReader())
      .from('integrations')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/integrations')
    // Settings-review 2026-10-09 (#4): aldrig nøgler/tokens (heller ikke ciphertext) til browseren
    return { success: true, data: maskIntegrationSecrets(data) as Integration }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke ændre integration status') }
  }
}

// =====================================================
// WEBHOOKS CRUD
// =====================================================

export async function getWebhooks(integrationId: string): Promise<ActionResult<IntegrationWebhook[]>> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('integration_webhooks')
      .select('*')
      .eq('integration_id', integrationId)
      .order('name')

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as IntegrationWebhook[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente webhooks') }
  }
}

export async function createWebhook(
  input: CreateWebhookInput
): Promise<ActionResult<IntegrationWebhook>> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await requireGate('settings.manage')

    const { data, error } = await supabase
      .from('integration_webhooks')
      .insert(input)
      .select()
      .single()

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

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
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await requireGate('settings.manage')

    const { id, ...updateData } = input

    const { data, error } = await supabase
      .from('integration_webhooks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as IntegrationWebhook }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere webhook') }
  }
}

export async function deleteWebhook(id: string): Promise<ActionResult> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    validateUUID(id, 'webhook ID')
    const { supabase } = await requireGate('settings.manage')

    const { error } = await supabase
      .from('integration_webhooks')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

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
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('integration_endpoints')
      .select('*')
      .eq('integration_id', integrationId)
      .order('name')

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as IntegrationEndpoint[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente endpoints') }
  }
}

export async function createEndpoint(
  input: CreateEndpointInput
): Promise<ActionResult<IntegrationEndpoint>> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await requireGate('settings.manage')

    const { data, error } = await supabase
      .from('integration_endpoints')
      .insert(input)
      .select()
      .single()

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

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
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await requireGate('settings.manage')

    const { id, ...updateData } = input

    const { data, error } = await supabase
      .from('integration_endpoints')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/integrations')
    return { success: true, data: data as IntegrationEndpoint }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere endpoint') }
  }
}

export async function deleteEndpoint(id: string): Promise<ActionResult> {
  try {
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await requireGate('settings.manage')

    const { error } = await supabase
      .from('integration_endpoints')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

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
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await getAuthenticatedClient()

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

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

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
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('external_references')
      .select(`
        *,
        integration:integrations(id, name)
      `)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)

    if (error) {
      logger.error('Database error', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as ExternalReference[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente eksterne referencer') }
  }
}

// =====================================================
// WEBHOOK TRIGGERING
// =====================================================

/**
 * Build webhook payload for a project event
 */
export async function buildProjectWebhookPayload(
  projectId: string,
  eventType: WebhookEventType
): Promise<WebhookPayload | null> {
  const { supabase } = await getAuthenticatedClient()

  const { data: project, error } = await supabase
    .from('projects')
    .select(`
      *,
      customer:customers(id, company_name),
      offer:offers(id, offer_number)
    `)
    .eq('id', projectId)
    .maybeSingle()

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
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase, userId } = await requireGate('offers.send')

    // Get integration
    const { data: integrationRow, error: intError } = await (await secretColumnReader())
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .maybeSingle()

    if (intError || !integrationRow) {
      return { success: false, error: 'Integration ikke fundet' }
    }

    if (!integrationRow.is_active) {
      return { success: false, error: 'Integration er ikke aktiv' }
    }

    // Dekrypter secrets in-memory foer auth-headers bygges.
    const integration = await decryptIntegrationSecrets(integrationRow as Integration)

    // Get endpoint for create_order
    const { data: endpoint } = await supabase
      .from('integration_endpoints')
      .select('*')
      .eq('integration_id', integrationId)
      .eq('operation', 'create_order')
      .eq('is_active', true)
      .maybeSingle()

    if (!endpoint) {
      return { success: false, error: 'Ingen aktiv endpoint for ordre-oprettelse' }
    }

    // Build payload
    const payload = await buildOfferWebhookPayload(supabase, offerId, 'offer.accepted')
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
      request_headers: redactSecretHeaders(headers), // settings-review 2026-10-09: ingen nøgler i loggen
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
    if (!(await checkIntegrationAccess())) return PERM_DENIED_INTEGRATION
    const { supabase } = await requireGate('settings.manage')

    const { data: integrationRow, error } = await (await secretColumnReader())
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .maybeSingle()

    if (error || !integrationRow) {
      return { success: false, error: 'Integration ikke fundet' }
    }

    // Dekrypter secrets in-memory foer auth-headers bygges.
    const integration = await decryptIntegrationSecrets(integrationRow as Integration)

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
    await (await secretColumnReader())
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
