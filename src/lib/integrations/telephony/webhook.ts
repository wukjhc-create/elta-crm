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
