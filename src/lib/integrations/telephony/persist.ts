/**
 * 00247: læg en parset Relatel-hændelse i databasen via telephony_ingest_event (service_role). Bevidst IKKE 'use server'.
 *
 * Idempotensen ligger i databasen (UNIQUE provider_event_id + ON CONFLICT i én transaktion) — ingen has()/put() her.
 * Funktionen tager hverken kunde eller sag: lagring vælger aldrig en kunde/sag og opretter ingen opgave, påmindelse,
 * Telegram-hændelse, SMS eller kundekommunikation. Ingen rå payload gemmes — kun SHA-256 af kroppen.
 */
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TelephonyEvent } from './types'

export type PersistOutcome = 'created' | 'duplicate' | 'conflict'
export type PersistResult =
  | { ok: true; outcome: PersistOutcome; callId: string | null }
  | { ok: false; reason: 'unavailable' | 'invalid' | 'error'; message: string }

/** Ingen tabel/funktion endnu (fx prod før 00247): PostgREST PGRST202/PGRST205, Postgres 42P01/42883 */
const MISSING_SCHEMA_CODES = new Set(['PGRST202', 'PGRST205', '42P01', '42883'])

export function isMissingTelephonySchema(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) return true
  return /telephony_/.test(error.message ?? '') && /(does not exist|could not find|schema cache)/i.test(error.message ?? '')
}

export function payloadSha256(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex')
}

/** Hændelses-id i databasen = idempotensnøglen uden udbyder-præfiks ('relatel:') */
export function providerEventId(event: TelephonyEvent): string {
  return event.idempotencyKey.replace(/^relatel:/, '')
}

/** Parametre til telephony_ingest_event (null hvis hændelsen ikke kan gemmes) */
export function ingestParams(event: TelephonyEvent, rawBody: string): Record<string, unknown> | null {
  const eventId = providerEventId(event)
  if (!eventId || eventId.length > 160 || !event.externalId || event.externalId.length > 128) return null
  return {
    p_provider: event.provider,
    p_provider_event_id: eventId,
    p_provider_call_id: event.externalId,
    p_event_type: event.eventType,
    p_schema_kind: event.schema,
    p_occurred_at: event.occurredAt,
    p_direction: event.direction,
    p_from: event.from,
    p_to: event.to,
    p_duration: event.durationSeconds === null ? null : Math.max(0, Math.min(86400, Math.round(event.durationSeconds))),
    p_answered: event.answered,
    p_has_voicemail: event.hasVoicemail,
    p_voicemail_duration: event.voicemailDurationSeconds ?? null,
    p_provider_voicemail_id: event.providerVoicemailId ?? null,
    p_provider_employee_id: event.providerEmployeeId ?? null,
    p_payload_sha256: payloadSha256(rawBody),
  }
}

export async function persistTelephonyEvent(admin: SupabaseClient, event: TelephonyEvent, rawBody: string): Promise<PersistResult> {
  if (event.eventType === 'sms.received' || event.eventType === 'sms.sent') {
    return { ok: false, reason: 'invalid', message: 'SMS-hændelser gemmes ikke.' }
  }
  const params = ingestParams(event, rawBody)
  if (!params) return { ok: false, reason: 'invalid', message: 'Hændelses- eller opkalds-id er for langt eller mangler.' }
  const { data, error } = await admin.rpc('telephony_ingest_event', params)
  if (isMissingTelephonySchema(error)) return { ok: false, reason: 'unavailable', message: 'Telefoni-tabellerne findes ikke her endnu.' }
  if (error) return { ok: false, reason: 'error', message: error.code ? `Databasefejl (${error.code})` : 'Databasefejl' }
  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string; call_id?: string | null } | null
  const outcome = row?.outcome
  if (outcome !== 'created' && outcome !== 'duplicate' && outcome !== 'conflict') {
    return { ok: false, reason: 'error', message: 'Uventet svar fra databasen' }
  }
  return { ok: true, outcome, callId: row?.call_id ?? null }
}
