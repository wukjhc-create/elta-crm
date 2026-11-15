/**
 * Indgående telefoni-hændelser. Ingen udgående registrering hos Relatel.
 *
 * To former accepteres:
 *  - canonical: vores egen konvolut (tests og en fremtidig adapter)
 *  - unverified_call: et opkaldsobjekt med uuid, som ligner det udokumenterede GET /calls
 * Alt andet afvises. Der gættes ikke en kunde ud fra fritekst.
 */
import { toRelatelNumber } from '@/lib/integrations/relatel/phone'
import type { TelephonyEvent, TelephonyEventType } from './types'

const EVENT_TYPES: ReadonlySet<string> = new Set([
  'call.started', 'call.answered', 'call.missed', 'call.ended', 'voicemail.created', 'sms.received', 'sms.sent',
])

export type ParsedWebhook =
  | { ok: true; event: TelephonyEvent }
  | { ok: false; reason: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function phone(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v == null || v === '') return { ok: true, value: null }
  if (typeof v !== 'string') return { ok: false }
  const n = toRelatelNumber(v)
  return n ? { ok: true, value: n } : { ok: false }
}

function iso(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const t = Date.parse(s)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString()
}

/** Udbyder-id (medarbejder, telefonsvarer): ikke-tom streng eller heltal, højst `max` tegn — ellers null */
function providerId(v: unknown, max: number): string | null {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : str(v)
  return s && s.length <= max ? s : null
}

function seconds(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 86400 ? Math.round(v) : null
}

function direction(v: unknown): 'inbound' | 'outbound' | null | false {
  if (v == null || v === '') return null
  if (v === 'inbound' || v === 'outbound') return v
  return false
}

// ------------------------------------------------------------------------------------------------------------------
// Relatels OFFICIELLE webhook-konvolut (kundeguide aug. 2026): { delivery_id, event_type, occurred_at, payload }.
// Dokumenterede hændelser pr. ressource (en webhook lytter til præcis én ressource). Indholdet af `payload` er IKKE
// dokumenteret — se mapRelatelCallPayload.
export const RELATEL_DOCUMENTED_EVENTS: ReadonlySet<string> = new Set([
  'call.created', 'call.ended', 'incoming_message.created',
  'chat.new', 'chat.answered', 'chat.ended',
  'contact.created', 'contact.updated', 'contact.destroyed',
  'webhook.test',
])
export const RELATEL_CALL_EVENTS: ReadonlySet<string> = new Set(['call.created', 'call.ended'])

export interface RelatelEnvelope {
  deliveryId: string
  eventType: string
  occurredAt: string
  payload: Record<string, unknown>
}

export type EnvelopeParse =
  | { kind: 'not_envelope' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'envelope'; envelope: RelatelEnvelope }

/** Genkend Relatels konvolut. Vores egen testkonvolut (provider: 'relatel') er IKKE en Relatel-konvolut. */
export function parseRelatelEnvelope(body: unknown): EnvelopeParse {
  if (!isRecord(body) || body.provider === 'relatel' || !('delivery_id' in body)) return { kind: 'not_envelope' }
  const deliveryId = providerId(body.delivery_id, 128)
  if (!deliveryId) return { kind: 'invalid', reason: 'delivery_id mangler eller er ugyldigt.' }
  const eventType = str(body.event_type)
  if (!eventType) return { kind: 'invalid', reason: 'event_type mangler.' }
  const occurredAt = iso(body.occurred_at)
  if (!occurredAt) return { kind: 'invalid', reason: 'occurred_at mangler eller er ikke et tidspunkt.' }
  const payload = body.payload == null ? {} : body.payload
  if (!isRecord(payload)) return { kind: 'invalid', reason: 'payload skal være et objekt.' }
  return { kind: 'envelope', envelope: { deliveryId, eventType, occurredAt, payload } }
}

/**
 * Feltnavne og typer i payload — ALDRIG værdier (ingen numre, navne eller id'er). Bruges til at dokumentere Relatels
 * reelle payload ved første godkendte modtagelse (aktiveringstrin "capture"), uden at gemme persondata.
 */
export function describePayloadShape(value: unknown, depth = 0): unknown {
  if (value === null) return 'null'
  if (Array.isArray(value)) return depth >= 2 ? 'array' : [value.length ? describePayloadShape(value[0], depth + 1) : 'empty']
  if (typeof value !== 'object') return typeof value
  if (depth >= 2) return 'object'
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(value as Record<string, unknown>).slice(0, 60)) out[k.slice(0, 64)] = describePayloadShape((value as Record<string, unknown>)[k], depth + 1)
  return out
}

function relatelDirection(v: unknown): 'inbound' | 'outbound' | null | false {
  if (v == null || v === '') return null
  if (v === 'incoming') return 'inbound'
  if (v === 'outgoing') return 'outbound'
  return false
}

/**
 * call.created / call.ended → intern hændelse. UVERIFICERET: Relatel dokumenterer ikke payload-felterne; vi accepterer
 * KUN en payload, der har det dokumenterede REST-`Call`-skemas felter (dev.relatel.dk/oas v2.1.2: call_uuid,
 * direction incoming|outgoing, from_number/to_number, started_at/answered_at/ended_at, status, talk_duration,
 * answered_by.id, voice_mail). Mangler call_uuid, er payloaden ikke genkendt → ingen gæt (kalderen afgør svaret).
 * Idempotens: Relatel-Delivery-Id (samme på alle forsøg af én hændelse). Korrelation pr. opkald: call_uuid.
 */
export function mapRelatelCallPayload(env: RelatelEnvelope): ParsedWebhook {
  if (!RELATEL_CALL_EVENTS.has(env.eventType)) return { ok: false, reason: 'Ikke en opkaldshændelse.' }
  const p = env.payload
  const callUuid = str(p.call_uuid)
  if (!callUuid || callUuid.length > 128) return { ok: false, reason: 'payload_unverified' }
  const dir = relatelDirection(p.direction)
  if (dir === false) return { ok: false, reason: 'Retning skal være incoming eller outgoing.' }
  const from = phone(p.from_number)
  const to = phone(p.to_number)
  if (!from.ok || !to.ok) return { ok: false, reason: 'Telefonnummeret kan ikke normaliseres.' }
  if (!from.value && !to.value) return { ok: false, reason: 'Opkaldet har hverken fra- eller til-nummer.' }
  const status = str(p.status)
  const answered = p.answered_at != null && p.answered_at !== '' ? true : status === 'answered' ? true : status === 'missed' || status === 'voicemail' ? false : null
  const vm = isRecord(p.voice_mail) ? p.voice_mail : null
  const hasVoicemail = status === 'voicemail' || vm !== null
  const answeredBy = isRecord(p.answered_by) ? p.answered_by : null
  let eventType: TelephonyEventType = 'call.started'
  if (env.eventType === 'call.ended') eventType = dir === 'inbound' && answered !== true ? 'call.missed' : 'call.ended'
  return {
    ok: true,
    event: {
      idempotencyKey: `relatel:delivery:${env.deliveryId}`,
      provider: 'relatel',
      eventType,
      occurredAt: env.occurredAt,
      direction: dir,
      from: from.value,
      to: to.value,
      externalId: callUuid,
      durationSeconds: seconds(p.talk_duration),
      answered,
      hasVoicemail,
      schema: 'unverified_call',
      providerEmployeeId: answeredBy ? providerId(answeredBy.id, 64) : null,
      voicemailDurationSeconds: vm ? seconds(vm.duration) : null,
      providerVoicemailId: vm ? providerId(vm.id, 128) : null,
    },
  }
}

export function parseRelatelWebhook(body: unknown): ParsedWebhook {
  if (!isRecord(body)) return { ok: false, reason: 'Hændelsen skal være et JSON-objekt.' }

  if (str(body.provider) === 'relatel' && str(body.event_id) && str(body.event_type)) {
    const eventType = str(body.event_type) as string
    if (!EVENT_TYPES.has(eventType)) return { ok: false, reason: 'Ukendt hændelsestype.' }
    const occurredAt = iso(body.occurred_at)
    if (!occurredAt) return { ok: false, reason: 'occurred_at mangler eller er ikke et tidspunkt.' }
    const call = isRecord(body.call) ? body.call : {}
    const dir = direction(call.direction ?? body.direction)
    if (dir === false) return { ok: false, reason: 'Retning skal være inbound eller outbound.' }
    const from = phone(call.from ?? body.from)
    const to = phone(call.to ?? body.to)
    if (!from.ok || !to.ok) return { ok: false, reason: 'Telefonnummeret kan ikke normaliseres.' }
    if (!from.value && !to.value) return { ok: false, reason: 'Hændelsen har hverken fra- eller til-nummer.' }
    const externalId = str(call.uuid) ?? str(body.event_id) as string
    const duration = typeof call.duration_seconds === 'number' && Number.isFinite(call.duration_seconds) ? call.duration_seconds : null
    return {
      ok: true,
      event: {
        idempotencyKey: `relatel:${str(body.event_id)}`,
        provider: 'relatel',
        eventType: eventType as TelephonyEventType,
        occurredAt,
        direction: dir,
        from: from.value,
        to: to.value,
        externalId,
        durationSeconds: duration,
        answered: typeof call.answered === 'boolean' ? call.answered : call.answered_at ? true : eventType === 'call.missed' ? false : null,
        hasVoicemail: body.has_voicemail === true || eventType === 'voicemail.created',
        schema: 'canonical',
        providerEmployeeId: providerId(call.employee_id ?? body.employee_id, 64),
        voicemailDurationSeconds: isRecord(body.voicemail) ? seconds(body.voicemail.duration_seconds) : null,
        providerVoicemailId: isRecord(body.voicemail) ? providerId(body.voicemail.id, 128) : null,
      },
    }
  }

  const uuid = str(body.uuid)
  if (!uuid) return { ok: false, reason: 'Hændelsen mangler event_id eller uuid.' }
  const dir = direction(body.direction)
  if (dir === false) return { ok: false, reason: 'Retning skal være inbound eller outbound.' }
  const from = phone(body.from)
  const to = phone(body.to)
  if (!from.ok || !to.ok) return { ok: false, reason: 'Telefonnummeret kan ikke normaliseres.' }
  if (!from.value && !to.value) return { ok: false, reason: 'Opkaldet har hverken fra- eller til-nummer.' }
  const occurredAt = iso(body.started_at) ?? iso(body.ended_at)
  if (!occurredAt) return { ok: false, reason: 'Opkaldet mangler et tidspunkt.' }
  const answered = body.answered_at != null && body.answered_at !== ''
  const eventType: TelephonyEventType = dir === 'inbound' && !answered ? 'call.missed' : 'call.ended'
  return {
    ok: true,
    event: {
      idempotencyKey: `relatel:call:${uuid}:${eventType}`,
      provider: 'relatel',
      eventType,
      occurredAt,
      direction: dir,
      from: from.value,
      to: to.value,
      externalId: uuid,
      durationSeconds: typeof body.duration_seconds === 'number' && Number.isFinite(body.duration_seconds) ? body.duration_seconds : null,
      answered,
      hasVoicemail: false,
      schema: 'unverified_call',
    },
  }
}
