/**
 * Beslutning for POST /api/integrations/relatel/webhook.
 * Flag fra → 404. Flag til uden hemmelighed → 503. Gyldig hændelse gemmes ikke,
 * før telephony_events er migreret. Ingen webhook registreres hos Relatel.
 */
import { safeEqual } from '@/lib/security/safe-equal'
import { relatelEnabled } from './flags'
import { parseRelatelWebhook } from './webhook'

export interface WebhookDecision {
  status: number
  body: Record<string, unknown>
}

const MAX_BYTES = 100_000

export function decideRelatelWebhook(
  env: Record<string, string | undefined>,
  headerSecret: string | null,
  rawBody: string,
): WebhookDecision {
  if (!relatelEnabled(env)) return { status: 404, body: { error: 'Not found' } }
  if (rawBody.length > MAX_BYTES) return { status: 413, body: { error: 'Hændelsen er for stor.' } }
  const secret = (env.RELATEL_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    return { status: 503, body: { error: 'Webhook-hemmelighed mangler. Intet er modtaget.' } }
  }
  if (!headerSecret || !safeEqual(headerSecret, secret)) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { status: 400, body: { error: 'JSON kunne ikke læses.' } }
  }
  const event = parseRelatelWebhook(parsed)
  if (!event.ok) return { status: 400, body: { error: event.reason } }
  return {
    status: 202,
    body: {
      accepted: true,
      persisted: false,
      idempotencyKey: event.event.idempotencyKey,
      reason: 'Hændelsen er forstået, men telephony_events er ikke migreret. Intet er gemt, og der er ikke ringet eller sendt SMS.',
    },
  }
}
