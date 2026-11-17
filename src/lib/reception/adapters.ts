/**
 * Kanal-adaptere: kanonisk kilderække → InboundCommunication (lib/reception/contract.ts). Rene funktioner, bevidst
 * IKKE 'use server'. Ingen afsendelse, ingen skrivning, ingen rå leverandør-payload — kun normaliserede felter og en
 * henvisning tilbage til kilden (sourceTable + sourceId).
 *
 * Kunde-tilstand fra kilden:
 *   - mail koblet MANUELT (linked_by='manual')  → confirmed (et menneske har allerede afgjort det)
 *   - mail koblet automatisk                    → unique_match-kandidat (bekræftes i Henvendelser)
 *   - portalbesked fra kunden                   → confirmed (portal-token er kilden til koblingen)
 *   - opkald med customer_id (00247: kun menneskelig bekræftelse) → confirmed; suggested_customer_id → kandidat
 *   - webhenvendelse (FormSubmit)               → afsenderen er ALDRIG kunden; formularens telefon/mail bruges til matching
 */
import { clip, dedupeKeyFor, PREVIEW_MAX, TITLE_MAX, type InboundCommunication, type SenderCandidate } from './contract'

const emptySender = (): SenderCandidate => ({ label: null, phone: null, email: null, customerNumber: null, contactId: null })

export interface EmailSourceRow {
  id: string
  subject: string | null
  sender_email: string | null
  sender_name: string | null
  body_preview: string | null
  received_at: string
  customer_id: string | null
  customer_contact_id: string | null
  linked_by: string | null
  link_status: string | null
  has_attachments: boolean | null
  /** Kun til webhenvendelser: formularfelter udtrukket af serveren (extractFormSubmitFields) */
  form_fields?: Record<string, string> | null
}

export function isFormSubmit(row: Pick<EmailSourceRow, 'sender_email' | 'subject'>): boolean {
  return /@formsubmit\.co$/i.test(String(row.sender_email ?? '')) && /henvendelse/i.test(String(row.subject ?? ''))
}

const field = (f: Record<string, string> | null | undefined, ...keys: string[]) => {
  if (!f) return null
  for (const k of Object.keys(f)) if (keys.some((x) => k.toLowerCase() === x)) return f[k]?.trim() || null
  return null
}

export function emailToInbound(row: EmailSourceRow): InboundCommunication | null {
  if (row.link_status === 'ignored') return null
  const web = isFormSubmit(row)
  const sender: SenderCandidate = web
    ? { ...emptySender(), label: field(row.form_fields, 'name', 'navn'), phone: field(row.form_fields, 'phone', 'telefon'), email: field(row.form_fields, 'email', 'e-mail') }
    : { ...emptySender(), label: row.sender_name ?? null, email: row.sender_email ?? null, contactId: row.customer_contact_id ?? null }
  const confirmed = !!row.customer_id && row.linked_by === 'manual'
  const source = { table: 'incoming_emails' as const, id: row.id }
  const message = web ? clip(field(row.form_fields, 'message', 'besked') ?? row.body_preview, PREVIEW_MAX) : clip(row.body_preview, PREVIEW_MAX)
  return {
    provider: web ? 'formsubmit' : 'microsoft365',
    providerEventId: null,
    channel: web ? 'web_chat' : 'email',
    direction: 'inbound',
    occurredAt: row.received_at,
    sender,
    customer: confirmed
      ? { state: 'confirmed', customerId: row.customer_id, candidateId: null, candidateCount: 1 }
      : row.customer_id ? { state: 'unique_match', customerId: null, candidateId: row.customer_id, candidateCount: 1 }
        : { state: 'insufficient_information', customerId: null, candidateId: null, candidateCount: 0 },
    case: { state: 'not_applicable', caseId: null, candidateId: null },
    title: clip(web ? `Webhenvendelse${field(row.form_fields, 'inquiry_type', 'type') ? ` — ${field(row.form_fields, 'inquiry_type', 'type')}` : ''}` : (row.subject || 'Mail uden emne'), TITLE_MAX),
    message,
    transcript: { state: 'not_applicable', ref: null },
    attachments: [],
    urgency: 'normal',
    requestedActions: [],
    assigned: { profileId: null, team: null },
    processingState: 'new',
    dedupeKey: dedupeKeyFor('mail', source, null),
    source,
  }
}

export interface PortalSourceRow { id: string; customer_id: string; sender_type: string; sender_name: string | null; message: string; attachments: unknown[] | null; created_at: string; offer_id?: string | null }

/** Vedhæftnings-REFERENCER (navn/type) — aldrig URL. Databasen afleder de gemte referencer selv af kilden (00250). */
export function attachmentRefs(list: unknown): Array<{ documentId: null; name: string; mimeType: string | null }> {
  if (!Array.isArray(list)) return []
  return list.slice(0, 10).map((a) => {
    const o = (a ?? {}) as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name : typeof o.filename === 'string' ? o.filename : 'vedhæftning'
    const mime = typeof o.type === 'string' ? o.type : typeof o.contentType === 'string' ? o.contentType : null
    return { documentId: null, name: clip(name, 200), mimeType: mime }
  })
}

export function portalToInbound(row: PortalSourceRow): InboundCommunication | null {
  if (row.sender_type !== 'customer') return null // medarbejderens egne svar er ikke en henvendelse
  const source = { table: 'portal_messages' as const, id: row.id }
  const n = Array.isArray(row.attachments) ? row.attachments.length : 0
  return {
    provider: 'portal', providerEventId: null, channel: 'portal', direction: 'inbound', occurredAt: row.created_at,
    sender: { ...emptySender(), label: row.sender_name },
    customer: { state: 'confirmed', customerId: row.customer_id, candidateId: null, candidateCount: 1 },
    case: { state: 'not_applicable', caseId: null, candidateId: null },
    title: clip(n ? `Portalbesked (${n} vedhæftet)` : 'Portalbesked', TITLE_MAX),
    message: clip(row.message, PREVIEW_MAX),
    transcript: { state: 'not_applicable', ref: null },
    attachments: attachmentRefs(row.attachments),
    urgency: 'normal', requestedActions: [], assigned: { profileId: null, team: null }, processingState: 'new',
    dedupeKey: dedupeKeyFor('portal', source, null), source,
  }
}

/** 00247 telephony_calls (serverside-felter; læses kun for opkald brugeren selv kan se) */
export interface CallSourceRow {
  id: string; provider: string; provider_call_id: string; direction: string | null; started_at: string | null
  external_number_normalized: string | null; customer_id: string | null; suggested_customer_id: string | null
  candidate_count: number | null; missed: boolean | null; has_voicemail: boolean | null; service_case_id: string | null
}

export function callToInbound(row: CallSourceRow): InboundCommunication | null {
  if (!row.started_at) return null // et opkald uden tidspunkt bliver ikke til "nu"
  const source = { table: 'telephony_calls' as const, id: row.id }
  const state = row.missed ? (row.has_voicemail ? 'Telefonsvarer' : 'Ubesvaret opkald') : row.direction === 'outbound' ? 'Udgående opkald' : 'Indgående opkald'
  return {
    provider: row.provider, providerEventId: row.provider_call_id, channel: 'phone',
    direction: row.direction === 'outbound' ? 'outbound' : 'inbound', occurredAt: row.started_at,
    sender: { ...emptySender(), phone: row.external_number_normalized },
    customer: row.customer_id ? { state: 'confirmed', customerId: row.customer_id, candidateId: null, candidateCount: 1 }
      : row.suggested_customer_id ? { state: 'unique_match', customerId: null, candidateId: row.suggested_customer_id, candidateCount: 1 }
        : { state: (row.candidate_count ?? 0) > 1 ? 'ambiguous' : 'no_match', customerId: null, candidateId: null, candidateCount: row.candidate_count ?? 0 },
    case: row.customer_id && row.service_case_id ? { state: 'confirmed', caseId: row.service_case_id, candidateId: null } : { state: 'not_applicable', caseId: null, candidateId: null },
    title: state, message: '',
    // Ingen lyd og ingen transskription i dag (00247 gemmer ingen) — tilstanden er eksplicit, ikke "tom"
    transcript: { state: 'unavailable', ref: null },
    attachments: [], urgency: row.missed ? 'high' : 'normal', requestedActions: row.missed ? ['create_callback'] : [],
    assigned: { profileId: null, team: null }, processingState: 'new',
    dedupeKey: dedupeKeyFor(row.provider, source, row.provider_call_id), source,
  }
}

/** SMS: kun fundament. sms_messages (00034) indeholder i dag kun UDGÅENDE beskeder, og intet skriver i tabellen. */
export interface SmsSourceRow { id: string; customer_id: string | null; to_phone: string | null; message: string | null; status: string | null; created_at: string; direction?: 'inbound' | 'outbound' | null; from_phone?: string | null }

export function smsToInbound(row: SmsSourceRow): InboundCommunication | null {
  if (row.direction !== 'inbound') return null // udgående SMS er ikke en henvendelse
  const source = { table: 'sms_messages' as const, id: row.id }
  return {
    provider: 'sms', providerEventId: null, channel: 'sms', direction: 'inbound', occurredAt: row.created_at,
    sender: { ...emptySender(), phone: row.from_phone ?? null },
    customer: { state: 'insufficient_information', customerId: null, candidateId: null, candidateCount: 0 },
    case: { state: 'not_applicable', caseId: null, candidateId: null },
    title: 'SMS', message: clip(row.message, PREVIEW_MAX), transcript: { state: 'not_applicable', ref: null },
    attachments: [], urgency: 'normal', requestedActions: [], assigned: { profileId: null, team: null }, processingState: 'new',
    dedupeKey: dedupeKeyFor('sms', source, null), source,
  }
}

/**
 * Fase 3A — ELTAs egen web-chat (web_chat_messages = kanonisk kilde, 00250). Besøgendes navn/telefon/mail er
 * UBEKRÆFTEDE: de bruges KUN til den deterministiske kandidat-matcher, aldrig som bekræftet kunde.
 */
export interface WebChatSessionRow { id: string; visitor_name: string | null; visitor_phone: string | null; visitor_email: string | null; visitor_postal_code: string | null; topic: string | null }
export interface WebChatMessageRow { id: string; session_id: string; direction: 'inbound' | 'outbound'; author: 'visitor' | 'assistant'; body: string; created_at: string }

export const WEBCHAT_TOPIC_TITLE: Record<string, string> = {
  general: 'Web-chat', service: 'Web-chat — service', quote: 'Web-chat — tilbud', existing_case: 'Web-chat — eksisterende sag', human: 'Web-chat — ønsker en medarbejder',
}

export function webChatToInbound(msg: WebChatMessageRow, session: WebChatSessionRow): InboundCommunication {
  const source = { table: 'web_chat_messages' as const, id: msg.id }
  return {
    provider: 'elta_webchat', providerEventId: null, channel: 'web_chat', direction: msg.direction, occurredAt: msg.created_at,
    sender: msg.direction === 'inbound'
      ? { ...emptySender(), label: session.visitor_name, phone: session.visitor_phone, email: session.visitor_email }
      : { ...emptySender(), label: 'ELTA web-chat (automatisk svar)' },
    customer: { state: 'insufficient_information', customerId: null, candidateId: null, candidateCount: 0 },
    case: { state: 'not_applicable', caseId: null, candidateId: null },
    title: clip(WEBCHAT_TOPIC_TITLE[session.topic ?? 'general'] ?? 'Web-chat', TITLE_MAX),
    message: clip(msg.body, PREVIEW_MAX), transcript: { state: 'not_applicable', ref: null },
    attachments: [], urgency: 'normal', requestedActions: [], assigned: { profileId: null, team: null }, processingState: 'new',
    dedupeKey: dedupeKeyFor('webchat', source, null), source,
  }
}
