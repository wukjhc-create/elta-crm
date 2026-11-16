/**
 * AI-receptionist fase 2 — DOMÆNEKONTRAKT for normaliseret indgående kommunikation (alle kanaler).
 * Bevidst IKKE 'use server' (rene typer + validering).
 *
 * Kanal-adaptere (lib/reception/adapters/*) mapper kanal-lagrene (incoming_emails, portal_messages, telephony_calls,
 * sms_messages, upload-link) til denne kontrakt. Rå leverandør-payloads indgår ALDRIG — kun normaliserede felter og
 * en henvisning (sourceTable + sourceId) tilbage til den kanoniske kilde.
 */

export const CHANNELS = ['phone', 'email', 'sms', 'web_chat', 'portal', 'upload_link'] as const
export type Channel = (typeof CHANNELS)[number]

export const DIRECTIONS = ['inbound', 'outbound', 'internal'] as const
export type Direction = (typeof DIRECTIONS)[number]

/** Kanoniske kilder et normaliseret item kan pege tilbage på (ingen kopi af kildens indhold) */
export const SOURCE_TABLES = ['incoming_emails', 'portal_messages', 'telephony_calls', 'sms_messages', 'customer_documents', 'simulator', 'manual'] as const
export type SourceTable = (typeof SOURCE_TABLES)[number]

export const IDENTITY_STATES = ['unique_match', 'ambiguous', 'no_match', 'insufficient_information', 'read_error'] as const
export type IdentityState = (typeof IDENTITY_STATES)[number]
/** Kunde-match-tilstand på en henvendelse: matcherens udfald + menneskets afgørelse */
export type CustomerMatchState = IdentityState | 'confirmed' | 'rejected'

export const CASE_MATCH_STATES = ['none', 'exact', 'several_open', 'no_open_case', 'read_error', 'confirmed', 'not_applicable'] as const
export type CaseMatchState = (typeof CASE_MATCH_STATES)[number]

export const URGENCIES = ['low', 'normal', 'high', 'emergency'] as const
export type Urgency = (typeof URGENCIES)[number]

export const PROCESSING_STATES = ['new', 'open', 'awaiting_customer', 'handoff', 'handled', 'spam'] as const
export type ProcessingState = (typeof PROCESSING_STATES)[number]

export const TEAMS = ['kontor', 'service', 'salg', 'bogholderi', 'montor'] as const
export type Team = (typeof TEAMS)[number]

export const TRANSCRIPT_STATES = ['not_applicable', 'pending', 'available', 'unavailable', 'purged'] as const
export type TranscriptState = (typeof TRANSCRIPT_STATES)[number]

export interface SenderCandidate {
  /** Visningsnavn fra kilden (fx mail-afsenderens navn) — data, aldrig en identitetsbekræftelse */
  label: string | null
  phone: string | null
  email: string | null
  /** Kundenummer oplyst af afsenderen (ikke verificeret) */
  customerNumber: string | null
  /** Kendt kontakt (fx portal-token → kunde) — kun når kilden selv har koblingen */
  contactId: string | null
}

export interface InboundCommunication {
  provider: string
  /** Leverandørens hændelses-id (mail-id, call_uuid, besked-id …) — null hvis kilden ikke har et */
  providerEventId: string | null
  channel: Channel
  direction: Direction
  occurredAt: string
  sender: SenderCandidate
  customer: { state: CustomerMatchState; customerId: string | null; candidateId: string | null; candidateCount: number }
  case: { state: CaseMatchState; caseId: string | null; candidateId: string | null }
  title: string
  /** Kort uddrag/resumé (≤ 500 tegn). Fuld tekst bliver i kilden. */
  message: string
  transcript: { state: TranscriptState; ref: string | null }
  attachments: Array<{ documentId: string | null; name: string; mimeType: string | null }>
  urgency: Urgency
  requestedActions: string[]
  assigned: { profileId: string | null; team: Team | null }
  processingState: ProcessingState
  /** Idempotens: samme hændelse → samme nøgle (provider:sourceTable:sourceId eller provider:providerEventId) */
  dedupeKey: string
  source: { table: SourceTable; id: string | null }
}

export const PREVIEW_MAX = 500
export const TITLE_MAX = 200

export function clip(s: string | null | undefined, max: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function dedupeKeyFor(provider: string, source: { table: SourceTable; id: string | null }, providerEventId: string | null): string {
  if (source.id) return `${provider}:${source.table}:${source.id}`
  if (providerEventId) return `${provider}:event:${providerEventId}`
  throw new Error('dedupeKey kræver kilde-id eller leverandør-hændelses-id')
}

/** Validering af kontrakten (afviser ukendte enum-værdier og manglende nøgler) — returnerer fejlliste */
export function validateInbound(c: InboundCommunication): string[] {
  const errs: string[] = []
  const inList = <T extends string>(v: string, list: readonly T[], f: string) => { if (!(list as readonly string[]).includes(v)) errs.push(`${f}: ukendt værdi`) }
  inList(c.channel, CHANNELS, 'channel')
  inList(c.direction, DIRECTIONS, 'direction')
  inList(c.urgency, URGENCIES, 'urgency')
  inList(c.processingState, PROCESSING_STATES, 'processingState')
  inList(c.case.state, CASE_MATCH_STATES, 'case.state')
  inList(c.transcript.state, TRANSCRIPT_STATES, 'transcript.state')
  inList(c.source.table, SOURCE_TABLES, 'source.table')
  if (![...IDENTITY_STATES, 'confirmed', 'rejected'].includes(c.customer.state)) errs.push('customer.state: ukendt værdi')
  if (!c.provider) errs.push('provider mangler')
  if (!c.dedupeKey) errs.push('dedupeKey mangler')
  if (Number.isNaN(Date.parse(c.occurredAt))) errs.push('occurredAt ugyldig')
  if (c.customer.customerId && c.customer.state !== 'confirmed') errs.push('customerId kræver state=confirmed')
  if (c.case.caseId && c.case.state !== 'confirmed') errs.push('caseId kræver state=confirmed')
  if (c.title.length > TITLE_MAX) errs.push('title for lang')
  if (c.message.length > PREVIEW_MAX) errs.push('message for lang')
  return errs
}
