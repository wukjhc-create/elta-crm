/**
 * Udgaaende webhooks (server-only, IKKE 'use server'). Flyttet fra actions/integrations.ts, fordi:
 *  - kundeportalen (uden login) og cron skal kunne udsende tilbuds-events; den gamle action kraevede login og
 *    kastede AUTH_REQUIRED -> kunden fik "Der opstod en fejl" ved accept/aabning af tilbud.
 *  - en eksporteret server action uden gate lod enhver indlogget udsende webhooks med vilkaarlig payload.
 * Log/statistik skrives med service-role; tilbudsdata laeses med kalderens klient (bruger-RLS eller admin i portalen).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { secretColumnReader } from '@/lib/portal/token-reader'
import { decryptIntegrationSecrets, redactSecretHeaders } from '@/lib/services/integration-secrets'
import type { Integration, WebhookEventType, WebhookPayload, WebhookOfferData, WebhookProjectData } from '@/types/integrations.types'

type SupabaseLike = { from: (t: string) => any }

/**
 * Trigger webhooks for a specific event
 * This is called internally when events occur (offer accepted, project created, etc.)
 */
export async function dispatchWebhooks(
  eventType: WebhookEventType,
  payload: WebhookPayload
): Promise<{ triggered: number; succeeded: number; failed: number }> {
  // Systemskrivninger (log + statistik) — samme uanset kalder (bruger, kundeportal, cron)
  const supabase = createAdminClient()

  // Find all active webhooks for this event type
  // integrations(*) indeholder hemmelighedskolonner (skjult for bruger-sessionen, 00176) -> service-role
  const { data: webhooks, error: webhookError } = await (await secretColumnReader())
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
    // Dekrypter secrets in-memory lige foer auth-headers bygges.
    const integration = await decryptIntegrationSecrets(webhook.integration as Integration)
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
        request_headers: redactSecretHeaders(headers), // settings-review 2026-10-09: ingen nøgler i loggen
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
  supabase: SupabaseLike,
  offerId: string,
  eventType: WebhookEventType
): Promise<WebhookPayload | null> {
  const { data: offer, error } = await supabase
    .from('offers')
    .select(`
      *,
      customer:customers!offers_customer_id_fkey(id, company_name, contact_person, email),
      line_items:offer_line_items(description, quantity, unit, unit_price, total)
    `)
    .eq('id', offerId)
    .maybeSingle()

  if (error || !offer) return null

  // Phase 12A — udvid additivt med strukturerede rejection-felter. Null
  // paa ikke-rejected events (accept/sent/viewed). Eksisterende consumere
  // der ignorerer ukendte felter er upaavirket.
  const { REJECTION_REASON_LABELS } = await import('@/types/offers.types')
  const rejectionReason = (offer.rejection_reason ?? null) as string | null
  const rejectionReasonLabel = rejectionReason && rejectionReason in REJECTION_REASON_LABELS
    ? REJECTION_REASON_LABELS[rejectionReason as keyof typeof REJECTION_REASON_LABELS]
    : null

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
      rejection_reason: rejectionReason,
      rejection_reason_label: rejectionReasonLabel,
      rejection_note: offer.rejection_note ?? null,
      rejected_by_name: offer.rejected_by_name ?? null,
      rejected_by_email: offer.rejected_by_email ?? null,
    },
  }

  return payload
}

export function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function applyTemplate(
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

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj

  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    current = (current as Record<string, unknown>)[key]
  }

  return current
}

/**
 * Udsend et tilbuds-event uden nogensinde at kaste: webhooks er sekundære og må aldrig vælte kundens/brugerens
 * handling (accept, åbning, afsendelse). Fejl logges.
 */
export async function emitOfferEvent(supabase: SupabaseLike, offerId: string, eventType: WebhookEventType): Promise<void> {
  try {
    const payload = await buildOfferWebhookPayload(supabase, offerId, eventType)
    if (!payload) return
    dispatchWebhooks(eventType, payload).catch((err) => logger.error('Error triggering webhooks', { error: err, entityId: offerId }))
  } catch (err) {
    logger.error('Error building webhook payload', { error: err, entityId: offerId })
  }
}
