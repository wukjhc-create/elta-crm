/**
 * Beslutning for POST /api/integrations/relatel/webhook.
 * Flag fra → 404. Flag til uden hemmelighed → 503. Ingen webhook registreres hos Relatel.
 *
 * Lagring (00247) kun med TELEPHONY_PERSIST_ENABLED=true OVEN I RELATEL_ENABLED (standard fra). Fra = som før: 202,
 * persisted:false, intet gemt. Til = telephony_ingest_event (idempotent i databasen) og evt. kun et kunde-FORSLAG
 * (TELEPHONY_MATCH_MODE=suggest). Lagring opretter aldrig opgave, tilbageringning, påmindelse, Telegram, SMS, opkald
 * eller kundekommunikation, og vælger aldrig kunde/sag.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { safeEqual } from '@/lib/security/safe-equal'
import { relatelEnabled, telephonyMatchMode, telephonyPersistEnabled } from './flags'
import { parseRelatelWebhook } from './webhook'
import { persistTelephonyEvent } from './persist'
import { suggestCustomerForCall } from './suggest'
import type { TelephonyEvent } from './types'

export interface WebhookDecision {
  status: number
  body: Record<string, unknown>
}

const MAX_BYTES = 100_000

function decide(
  env: Record<string, string | undefined>,
  headerSecret: string | null,
  rawBody: string,
): { decision: WebhookDecision; event?: TelephonyEvent } {
  if (!relatelEnabled(env)) return { decision: { status: 404, body: { error: 'Not found' } } }
  if (rawBody.length > MAX_BYTES) return { decision: { status: 413, body: { error: 'Hændelsen er for stor.' } } }
  const secret = (env.RELATEL_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    return { decision: { status: 503, body: { error: 'Webhook-hemmelighed mangler. Intet er modtaget.' } } }
  }
  if (!headerSecret || !safeEqual(headerSecret, secret)) {
    return { decision: { status: 401, body: { error: 'Unauthorized' } } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { decision: { status: 400, body: { error: 'JSON kunne ikke læses.' } } }
  }
  const event = parseRelatelWebhook(parsed)
  if (!event.ok) return { decision: { status: 400, body: { error: event.reason } } }
  return {
    event: event.event,
    decision: {
      status: 202,
      body: {
        accepted: true,
        persisted: false,
        idempotencyKey: event.event.idempotencyKey,
        reason: 'Hændelsen er forstået, men lagring er slået fra. Intet er gemt, og der er ikke ringet eller sendt SMS.',
      },
    },
  }
}

/** Synkron beslutning uden lagring (flag, størrelse, hemmelighed, format) */
export function decideRelatelWebhook(
  env: Record<string, string | undefined>,
  headerSecret: string | null,
  rawBody: string,
): WebhookDecision {
  return decide(env, headerSecret, rawBody).decision
}

/**
 * Fuld behandling. `admin` kaldes kun når lagring er slået til og hændelsen er gyldig (service_role).
 * Svar: 202 created/duplicate · 409 conflict (samme hændelses-id med andet opkald/anden krop — intet ændret) ·
 * 202 persisted:false (SMS, eller tabellerne findes ikke endnu) · 500 ved databasefejl (Relatel må gentage; idempotent).
 */
export async function handleRelatelWebhook(
  env: Record<string, string | undefined>,
  headerSecret: string | null,
  rawBody: string,
  deps: { admin: () => SupabaseClient; log?: (msg: string, meta: Record<string, unknown>) => void },
): Promise<WebhookDecision> {
  const { decision, event } = decide(env, headerSecret, rawBody)
  if (!event || decision.status !== 202 || !telephonyPersistEnabled(env)) return decision

  const admin = deps.admin()
  const res = await persistTelephonyEvent(admin, event, rawBody)
  const base = { accepted: true, idempotencyKey: event.idempotencyKey }
  if (!res.ok) {
    if (res.reason === 'error') {
      deps.log?.('relatel webhook: lagring fejlede', { message: res.message })
      return { status: 500, body: { error: 'Hændelsen kunne ikke gemmes. Prøv igen.' } }
    }
    return { status: 202, body: { ...base, persisted: false, reason: res.message } }
  }
  if (res.outcome === 'conflict') {
    deps.log?.('relatel webhook: hændelses-id genbrugt med andet indhold', { idempotencyKey: event.idempotencyKey })
    return { status: 409, body: { error: 'Hændelses-id findes allerede med andet indhold. Intet er ændret.' } }
  }
  let suggestion: string | undefined
  if (res.outcome === 'created' && res.callId && telephonyMatchMode(env) === 'suggest') {
    try {
      suggestion = (await suggestCustomerForCall(admin, res.callId)).outcome
    } catch (e) {
      suggestion = 'error'
      deps.log?.('relatel webhook: kundeforslag fejlede', { message: e instanceof Error ? e.message : String(e) })
    }
  }
  return { status: 202, body: { ...base, persisted: true, outcome: res.outcome, ...(suggestion ? { suggestion } : {}) } }
}
