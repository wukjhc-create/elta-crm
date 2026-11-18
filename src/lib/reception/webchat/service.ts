/**
 * Fase 3A — ELTAs egen web-chat (IKKE Nila). Server-only: bevidst IKKE 'use server' (kaldes kun fra /api/webchat).
 * Flag RECEPTION_WEBCHAT_ENABLED (standard FRA; prod FRA). Samme kontrakt, matcher, politik, motor, Henvendelser,
 * forslagsmodel og handoff som mail/portal/telefon:
 *
 *   besked → web_chat_messages (kanonisk kilde, idempotent på klient-id) → webChatToInbound → receptionBackgroundIngest
 *   (gate 'webchat': motor + reception_ingest; kun forslag) → composeWebChatReply (politik før model) → svaret gemmes
 *   som udgående chat-besked og føjes til samme henvendelses tråd.
 *
 * Svaret vises KUN i chat-vinduet, som den besøgende selv har åbnet. Der sendes ingen SMS/mail/opkald. Besøgendes
 * oplysninger er ubekræftede (kun kandidat). Kundespecifik information kræver motorens deterministiske bekræftelse.
 */
import { webChatToInbound, type WebChatSessionRow } from '../adapters'
import { backgroundCapability, receptionBackgroundIngest, type BackgroundCapability } from '../background-actor'
import { buildIngestPayload } from '../henvendelser-core'
import { normStreet } from '../disclosure'
import { webChatAiReplyEnabled, webChatEnabled } from '../flags'
import { composeWebChatReply, type ReplySource } from './reply'
import { normalizeChatText, WEBCHAT_LIMITS, WEBCHAT_REPEAT_WINDOW_MIN, WEBCHAT_SESSION_LIFETIME_MIN, type RateScope } from './abuse'
import { WEBCHAT_MAX_MESSAGES, WEBCHAT_MESSAGE_MAX, WEBCHAT_TOPICS, webChatStore, type VisitorInfo, type WebChatMessage, type WebChatSession, type WebChatStore, type WebChatTopic } from './store'

export interface WebChatDeps {
  env?: Record<string, string | undefined>
  store?: WebChatStore
  capability?: BackgroundCapability
  rephrase?: (base: string, facts: Record<string, string>) => Promise<string | null>
  now?: () => number
}

export type WebChatError = 'disabled' | 'invalid' | 'session_unknown' | 'limit' | 'unavailable'
export type StartResult = { ok: true; token: string; greeting: string } | { ok: false; error: WebChatError }
export type PostResult =
  | { ok: true; duplicate: true; reply: null }
  | { ok: true; duplicate: false; reply: string; source: ReplySource; handoff: boolean; urgency: string }
  | { ok: false; error: WebChatError }

const VISITOR_HIDDEN_REASONS = new Set<string>(['ambiguous_identity', 'identity_read_error', 'verification_failed'])

export const WEBCHAT_GREETING = 'Hej, du skriver med Elta Solars chat. Skriv kort, hvad det drejer sig om. Er der fare for liv, brand, røg eller gnister, så ring 112.'

/** Emnet (knappen den besøgende valgte) bruges som klassifikations-hint — det gemmes ikke som kundens tekst */
const TOPIC_HINT: Record<WebChatTopic, string> = {
  general: '', service: 'Jeg har en fejl og brug for service. ', quote: 'Jeg vil gerne have et tilbud. ',
  existing_case: 'Jeg har et spørgsmål til min sag. ', human: 'Jeg vil gerne tale med en medarbejder. ',
}

async function deps0(d: WebChatDeps): Promise<{ store: WebChatStore; cap: BackgroundCapability }> {
  if (d.store && d.capability) return { store: d.store, cap: d.capability }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  return { store: d.store ?? webChatStore(admin), cap: d.capability ?? backgroundCapability(admin) }
}

/**
 * Misbrugsværn (final review §3): holdbar tæller i databasen pr. HMAC-nøgle + globalt loft. Fejl ⇒ afvist (fail closed).
 * Afvisningen er ens for alle (ingen oplysning om kunder, sessioner eller grænsens tilstand).
 */
async function guard(store: WebChatStore, abuseKey: string | null | undefined, scope: RateScope): Promise<WebChatError | null> {
  if (!abuseKey || !/^[0-9a-f]{64}$/.test(abuseKey)) return 'unavailable'
  const r = await store.rateCheck(abuseKey, scope, WEBCHAT_LIMITS[scope])
  if (!r.ok) return 'unavailable'
  return r.allowed ? null : 'limit'
}

export async function startWebChat(input: { visitor?: VisitorInfo; topic?: string; abuseKey?: string | null }, d: WebChatDeps = {}): Promise<StartResult> {
  if (!webChatEnabled(d.env ?? process.env)) return { ok: false, error: 'disabled' }
  const topic = (WEBCHAT_TOPICS as readonly string[]).includes(String(input.topic)) ? (input.topic as WebChatTopic) : 'general'
  const { store } = await deps0(d)
  const blocked = await guard(store, input.abuseKey, 'start')
  if (blocked) return { ok: false, error: blocked }
  const s = await store.createSession(input.visitor ?? {}, topic)
  if (!s.ok) return { ok: false, error: 'unavailable' }
  return { ok: true, token: s.token, greeting: WEBCHAT_GREETING }
}

async function defaultRephrase(base: string, facts: Record<string, string>): Promise<string | null> {
  const { aiStructured } = await import('@/lib/ai/ai-client')
  const r = await aiStructured('reception_webchat_reply', [
    { role: 'system', content: 'Du omformulerer et kort svar fra Elta Solars web-chat til venligt, naturligt dansk. Brug KUN oplysningerne i "svar" og "fakta". Tilføj aldrig nye fakta, tal, priser, datoer, tidspunkter, løfter, garanti-, lov- eller el-sikkerhedsråd. Svar KUN med JSON {"reply": "<tekst>"} på højst 3 sætninger.' },
    // Den besøgendes egen tekst sendes IKKE til modellen — kun det deterministiske svar og kendte firmafakta
    { role: 'user', content: JSON.stringify({ svar: base, fakta: facts }) },
  ], (x) => (x && typeof x === 'object' && typeof (x as { reply?: unknown }).reply === 'string' ? String((x as { reply: string }).reply) : null))
  return r.ok ? r.data : null
}

export async function postWebChatMessage(input: { token: string; text: string; clientMessageId?: string | null; visitor?: VisitorInfo; abuseKey?: string | null }, d: WebChatDeps = {}): Promise<PostResult> {
  const env = d.env ?? process.env
  if (!webChatEnabled(env)) return { ok: false, error: 'disabled' }
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (!text || text.length > WEBCHAT_MESSAGE_MAX) return { ok: false, error: 'invalid' }
  const { store, cap } = await deps0(d)
  // Værnet FØR sessionsopslag: ugyldige tokens tæller også (ingen gratis gætteri)
  const blocked = await guard(store, input.abuseKey, 'message')
  if (blocked) return { ok: false, error: blocked }
  const found = await store.findSession(input.token)
  if (!found.ok) return { ok: false, error: 'unavailable' }
  if (!found.session) return { ok: false, error: 'session_unknown' }
  let session: WebChatSession = found.session
  const nowMs = (d.now ?? Date.now)()
  const started = Date.parse(session.created_at)
  // Maks. levetid: en udløbet session behandles som ukendt (start en ny)
  if (!Number.isFinite(started) || nowMs - started > WEBCHAT_SESSION_LIFETIME_MIN * 60_000) return { ok: false, error: 'session_unknown' }
  if (session.closed_at || session.message_count >= WEBCHAT_MAX_MESSAGES) return { ok: false, error: 'limit' }
  // Samme tekst igen inden for vinduet (gentaget tryk med ny klient-id, eller netværks-genforsøg) → INGEN ny række. Den
  // allerede gemte besked indtages igen idempotent: var den indtaget, er det en dublet (intet nyt svar); fejlede indtaget
  // sidst, registreres den nu (så en gentagelse aldrig taber en besked).
  const last = await store.lastInbound(session.id)
  if (!last.ok) return { ok: false, error: 'unavailable' }
  let inboundMsg: WebChatMessage
  if (last.message && normalizeChatText(last.message.body) === normalizeChatText(text)
      && nowMs - Date.parse(last.message.created_at) < WEBCHAT_REPEAT_WINDOW_MIN * 60_000) {
    inboundMsg = last.message
  } else {
    if (input.visitor) {
      await store.updateVisitor(session.id, input.visitor)
      const again = await store.findSession(input.token)
      if (again.ok && again.session) session = again.session
    }
    const inbound = await store.addMessage(session.id, { direction: 'inbound', body: text, clientMessageId: input.clientMessageId ?? null })
    if (!inbound.ok) return { ok: false, error: 'unavailable' }
    // samme klient-id → databasens unikke nøgle gav den eksisterende række; indtaget nedenfor er idempotent
    inboundMsg = inbound.message
  }

  const sRow: WebChatSessionRow = { id: session.id, visitor_name: session.visitor_name, visitor_phone: session.visitor_phone, visitor_email: session.visitor_email, visitor_postal_code: session.visitor_postal_code, topic: session.topic }
  const comm = webChatToInbound(inboundMsg, sRow)
  // Oplyst postnummer/vejnavn bruges KUN til motorens deterministiske bekræftelse (disclosure.ts) — aldrig som identitet
  const street = normStreet(session.visitor_address)
  const claimed = session.visitor_postal_code ? { postalCode: session.visitor_postal_code, streetName: street ?? null, caseNumber: null } : undefined
  const r = await receptionBackgroundIngest(comm, `${TOPIC_HINT[(session.topic as WebChatTopic)] ?? ''}${text}`, { capability: () => cap, cap, gate: 'webchat', env, claimed })
  if (r.outcome === 'disabled') return { ok: false, error: 'disabled' }
  if (r.outcome === 'duplicate') return { ok: true, duplicate: true, reply: null }
  // Kunne henvendelsen ikke registreres, må den besøgende ikke tro, at kontoret har fået den
  if (r.outcome === 'error') return { ok: false, error: 'unavailable' }

  const reply = await composeWebChatReply({
    turn: r.turn, text, hasContact: !!(session.visitor_phone || session.visitor_email),
    rephrase: webChatAiReplyEnabled(env) ? (d.rephrase ?? defaultRephrase) : undefined,
  })
  const out = await store.addMessage(session.id, { direction: 'outbound', body: reply.text })
  if (out.ok && !out.duplicate) {
    // Svaret føjes til SAMME henvendelses tråd (udgående item; ingen handlinger)
    await cap.ingest(buildIngestPayload(webChatToInbound(out.message, sRow), null, { execute: false }))
  }
  // Intet kunde-orakel: identitets-årsager (tvetydig, læsefejl, fejlet bekræftelse) styrer kun det INTERNE handoff —
  // flaget til den besøgende afspejler kun årsager, der ikke afslører, om oplysningerne matcher en kunde
  const visibleHandoff = (r.turn.handoff?.reasons ?? []).some((x) => !VISITOR_HIDDEN_REASONS.has(x))
  return { ok: true, duplicate: false, reply: reply.text, source: reply.source, handoff: visibleHandoff, urgency: r.turn.urgency }
}
