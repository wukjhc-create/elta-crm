/**
 * Beslutning for POST /api/integrations/relatel/webhook.
 * Flag fra → 404. Ingen webhook registreres hos Relatel herfra (Relatel konfigureres kun i deres admin-UI).
 *
 * Godkendelse (Relatel final review 2026-11-15):
 *  - 'hmac' (PRODUKTION): RELATEL_WEBHOOK_SIGNING_KEY [+ _PREVIOUS under rotation] sat → Relatel-Signature
 *    (t=…,v1=HMAC-SHA256(`${t}.${rå krop}`)) skal passe og være højst 5 min gammel (signature.ts). Den statiske header
 *    ignoreres i denne tilstand.
 *  - 'static_legacy': kun RELATEL_WEBHOOK_SECRET (egen header x-elta-webhook-secret). IKKE Relatels mekanisme og
 *    ikke produktionsklar: lagring afvises (503), medmindre RELATEL_WEBHOOK_ALLOW_STATIC_SECRET=true (kun staging/test).
 *  - 'none': ingen nøgle → 503. Intet modtages.
 *
 * Formater: Relatels officielle konvolut { delivery_id, event_type, occurred_at, payload } (idempotens =
 * Relatel-Delivery-Id) samt vores egen testkonvolut og den gamle opkaldsform (webhook.ts).
 * Lagring (00247) kun med TELEPHONY_PERSIST_ENABLED=true OVEN I RELATEL_ENABLED (standard fra). Lagring opretter aldrig
 * opgave, tilbageringning, påmindelse, Telegram, SMS, opkald eller kundekommunikation, og vælger aldrig kunde/sag.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { safeEqual } from '@/lib/security/safe-equal'
import { relatelEnabled, telephonyMatchMode, telephonyPersistEnabled } from './flags'
import {
  describePayloadShape, mapRelatelCallPayload, parseRelatelEnvelope, parseRelatelWebhook,
  RELATEL_CALL_EVENTS, RELATEL_DOCUMENTED_EVENTS,
} from './webhook'
import { persistTelephonyEvent } from './persist'
import { suggestCustomerForCall } from './suggest'
import { relatelSigningKeys, verifyRelatelSignature } from './signature'
import type { TelephonyEvent } from './types'

export interface WebhookDecision {
  status: number
  body: Record<string, unknown>
}

/** Headere fra Relatel (og den gamle statiske header). En ren streng = kun den statiske header (bagudkompatibelt). */
export interface WebhookAuthInput {
  staticSecret?: string | null
  signature?: string | null
  timestamp?: string | null
  deliveryId?: string | null
  nowSeconds?: number
}

export type WebhookAuthMode = 'hmac' | 'static_legacy' | 'none'

const MAX_BYTES = 100_000
const isTrue = (v: string | undefined) => (v ?? '').trim().toLowerCase() === 'true'

export function webhookAuthMode(env: Record<string, string | undefined>): WebhookAuthMode {
  if (relatelSigningKeys(env).length > 0) return 'hmac'
  if ((env.RELATEL_WEBHOOK_SECRET ?? '').trim()) return 'static_legacy'
  return 'none'
}

function toAuth(x: string | null | WebhookAuthInput): WebhookAuthInput {
  return typeof x === 'string' || x === null ? { staticSecret: x } : x
}

interface Decided {
  decision: WebhookDecision
  event?: TelephonyEvent
  /** kun til log (feltnavne/typer, aldrig værdier) */
  logShape?: { eventType: string; shape: unknown }
  /** grund til 401 i HMAC-tilstand (fx 'stale', 'mismatch') — kun konsol-log, aldrig database (anonymt endpoint) */
  authFailure?: string
  /** godkendt Relatel-konvolut: hvad der skete — kun hændelsestype, udfald, nøgleplads og feltnavne/typer */
  observation?: { eventType: string; status: number; outcome: string; keySlot: string; shape: unknown }
}

function decide(env: Record<string, string | undefined>, authArg: string | null | WebhookAuthInput, rawBody: string): Decided {
  const auth = toAuth(authArg)
  let keySlot = 'static_legacy'
  if (relatelEnabled(env) && rawBody.length <= MAX_BYTES && webhookAuthMode(env) === 'hmac') {
    const check = verifyRelatelSignature({
      rawBody, signatureHeader: auth.signature, timestampHeader: auth.timestamp,
      keys: relatelSigningKeys(env), nowSeconds: auth.nowSeconds ?? Math.floor(Date.now() / 1000),
    })
    if (!check.ok) return { decision: { status: 401, body: { error: 'Unauthorized' } }, authFailure: check.reason }
    keySlot = check.keySlot
  }
  const d = decideAfterSignature(env, auth, rawBody)
  // Observation: kun for en GODKENDT Relatel-konvolut (ingen databaseskrivning for anonyme kald)
  if (d.decision.status !== 401 && d.decision.status !== 404 && d.decision.status !== 413 && d.decision.status !== 503) {
    let parsed: unknown = null
    try { parsed = JSON.parse(rawBody) } catch { /* ikke JSON → ingen observation */ }
    const env2 = parseRelatelEnvelope(parsed)
    if (env2.kind === 'envelope') {
      const b = d.decision.body
      const outcome = b.test === true ? 'test_acknowledged' : b.ignored === true ? 'ignored_not_ingested' : b.reason === 'payload_unverified' ? 'payload_unverified'
        : d.event ? 'call_mapped_unverified' : d.decision.status === 422 ? 'payload_unverified_rejected' : `rejected_${d.decision.status}`
      d.observation = { eventType: env2.envelope.eventType.slice(0, 64), status: d.decision.status, outcome, keySlot, shape: describePayloadShape(env2.envelope.payload) }
    }
  }
  return d
}

function decideAfterSignature(env: Record<string, string | undefined>, auth: WebhookAuthInput, rawBody: string): Decided {
  if (!relatelEnabled(env)) return { decision: { status: 404, body: { error: 'Not found' } } }
  if (rawBody.length > MAX_BYTES) return { decision: { status: 413, body: { error: 'Hændelsen er for stor.' } } }
  const mode = webhookAuthMode(env)
  if (mode === 'none') return { decision: { status: 503, body: { error: 'Webhook-nøgle mangler. Intet er modtaget.' } } }
  if (mode === 'static_legacy') {
    const secret = (env.RELATEL_WEBHOOK_SECRET ?? '').trim()
    if (!auth.staticSecret || !safeEqual(auth.staticSecret, secret)) return { decision: { status: 401, body: { error: 'Unauthorized' } } }
    if (telephonyPersistEnabled(env) && !isTrue(env.RELATEL_WEBHOOK_ALLOW_STATIC_SECRET)) {
      return { decision: { status: 503, body: { error: 'Statisk webhook-hemmelighed er ikke godkendt til lagring. Brug Relatels signeringsnøgle.' } } }
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { decision: { status: 400, body: { error: 'JSON kunne ikke læses.' } } }
  }

  const env2 = parseRelatelEnvelope(parsed)
  if (env2.kind === 'invalid') return { decision: { status: 400, body: { error: env2.reason } } }
  if (env2.kind === 'envelope') {
    const e = env2.envelope
    if (auth.deliveryId && auth.deliveryId.trim() !== e.deliveryId) return { decision: { status: 400, body: { error: 'Relatel-Delivery-Id passer ikke med delivery_id.' } } }
    if (!RELATEL_DOCUMENTED_EVENTS.has(e.eventType)) return { decision: { status: 400, body: { error: 'Ukendt hændelsestype.' } } }
    if (e.eventType === 'webhook.test') return { decision: { status: 200, body: { accepted: true, test: true, persisted: false } } }
    if (!RELATEL_CALL_EVENTS.has(e.eventType)) {
      // Dokumenteret, men bevidst ikke indtaget endnu (SMS/chat/kontakter): eksplicit "ikke gemt", aldrig "gemt"
      return { decision: { status: 202, body: { accepted: true, persisted: false, ignored: true, reason: 'Hændelsestypen indtages ikke (endnu).' } } }
    }
    const mapped = mapRelatelCallPayload(e)
    if (!mapped.ok) {
      const logShape = { eventType: e.eventType, shape: describePayloadShape(e.payload) }
      if (mapped.reason !== 'payload_unverified') return { decision: { status: 400, body: { error: mapped.reason } }, logShape }
      // Ukendt payload: med lagring TIL er det en fejl (Relatel gentager, og fejlen ses i deres leveringslog);
      // med lagring FRA (capture-fasen) kvitteres uden lagring, og kun feltnavne/typer logges.
      return telephonyPersistEnabled(env)
        ? { decision: { status: 422, body: { error: 'Opkaldshændelsens indhold er ikke genkendt. Intet er gemt.' } }, logShape }
        : { decision: { status: 202, body: { accepted: true, persisted: false, reason: 'payload_unverified' } }, logShape }
    }
    return {
      event: mapped.event,
      decision: { status: 202, body: { accepted: true, persisted: false, idempotencyKey: mapped.event.idempotencyKey, reason: 'Hændelsen er forstået, men lagring er slået fra. Intet er gemt.' } },
    }
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

/** Synkron beslutning uden lagring (flag, størrelse, godkendelse, format) */
export function decideRelatelWebhook(
  env: Record<string, string | undefined>,
  auth: string | null | WebhookAuthInput,
  rawBody: string,
): WebhookDecision {
  return decide(env, auth, rawBody).decision
}

/**
 * Fuld behandling. `admin` kaldes kun når lagring er slået til og hændelsen er gyldig (service_role).
 * Svar: 202 created/duplicate · 409 conflict (samme hændelses-id med andet opkald/anden krop — intet ændret) ·
 * 202 persisted:false (SMS, eller tabellerne findes ikke endnu) · 500 ved databasefejl (Relatel må gentage; idempotent).
 */
export async function handleRelatelWebhook(
  env: Record<string, string | undefined>,
  auth: string | null | WebhookAuthInput,
  rawBody: string,
  deps: {
    admin: () => SupabaseClient
    log?: (msg: string, meta: Record<string, unknown>) => void
    /** Observationstilstand (lagring FRA): kun hændelsestype/udfald/nøgleplads/feltnavne — aldrig værdier eller id'er */
    observe?: (o: NonNullable<Decided['observation']>) => Promise<void> | void
  },
): Promise<WebhookDecision> {
  const { decision, event, logShape, authFailure, observation } = decide(env, auth, rawBody)
  if (authFailure) deps.log?.('relatel webhook: signatur afvist', { reason: authFailure })
  if (logShape) deps.log?.('relatel webhook: opkaldshændelse med ukendt payload (kun feltnavne/typer)', logShape)
  if (observation && !telephonyPersistEnabled(env) && deps.observe) {
    try { await deps.observe(observation) } catch { /* observation må aldrig vælte svaret */ }
  }
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
