/**
 * Fase 3A — web-chattens lager (00250 web_chat_sessions/web_chat_messages = kanonisk kilde). Server-only: bevidst IKKE
 * 'use server' og aldrig i klientkode. Snævret kapabilitet over admin-klienten: KUN de to chat-tabeller + rpc
 * web_chat_rate_check, kun oprette session / finde session via token-HASH / opdatere besøgsoplysninger / tilføje besked /
 * læse seneste besøgende-besked / misbrugsværn. Receptionist-motoren
 * får aldrig denne kapabilitet (den får kun backgroundCapability: læse-porte + reception_ingest).
 */
import { createHash, randomBytes } from 'crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const WEBCHAT_MAX_MESSAGES = 30
export const WEBCHAT_MESSAGE_MAX = 1000
export const WEBCHAT_TOPICS = ['general', 'service', 'quote', 'existing_case', 'human'] as const
export type WebChatTopic = (typeof WEBCHAT_TOPICS)[number]

export interface VisitorInfo { name?: string | null; phone?: string | null; email?: string | null; postalCode?: string | null; address?: string | null }
export interface WebChatSession { id: string; visitor_name: string | null; visitor_phone: string | null; visitor_email: string | null; visitor_postal_code: string | null; visitor_address: string | null; topic: string; message_count: number; closed_at: string | null; created_at: string }
export interface WebChatMessage { id: string; session_id: string; direction: 'inbound' | 'outbound'; author: 'visitor' | 'assistant'; body: string; created_at: string }

export const hashChatToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
export const isChatToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)

const trimOrNull = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  return s ? s.slice(0, max) : null
}
/** Rens besøgendes oplysninger (ubekræftede; kun til kandidat-matching og kontakt) */
export function cleanVisitor(v: VisitorInfo | null | undefined): Record<string, string | null> {
  const pc = trimOrNull(v?.postalCode, 10)
  const email = trimOrNull(v?.email, 200)
  return {
    visitor_name: trimOrNull(v?.name, 200),
    visitor_phone: trimOrNull(v?.phone, 40),
    visitor_email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
    visitor_postal_code: pc && /^[0-9]{4}$/.test(pc) ? pc : null,
    visitor_address: trimOrNull(v?.address, 300),
  }
}

const SESSION_COLS = 'id, visitor_name, visitor_phone, visitor_email, visitor_postal_code, visitor_address, topic, message_count, closed_at, created_at'

export interface WebChatStore {
  createSession(visitor: VisitorInfo, topic: WebChatTopic): Promise<{ ok: true; session: WebChatSession; token: string } | { ok: false; error: string }>
  findSession(token: string): Promise<{ ok: true; session: WebChatSession | null } | { ok: false; error: string }>
  updateVisitor(sessionId: string, visitor: VisitorInfo): Promise<boolean>
  /** Idempotent på clientMessageId (samme klient-besked → samme række, duplicate=true) */
  addMessage(sessionId: string, m: { direction: 'inbound' | 'outbound'; body: string; clientMessageId?: string | null }): Promise<{ ok: true; message: WebChatMessage; duplicate: boolean } | { ok: false; error: string }>
  /** Seneste besked fra den besøgende i sessionen (gentagelses-værn) */
  lastInbound(sessionId: string): Promise<{ ok: true; message: WebChatMessage | null } | { ok: false; error: string }>
  /** Misbrugsværn (00250 web_chat_rate_check). Fejl ⇒ { ok: false } ⇒ kalderen afviser (fail closed). */
  rateCheck(key: string, scope: 'start' | 'message', limits: { burst: number; hour: number; globalHour: number }): Promise<{ ok: true; allowed: boolean } | { ok: false }>
}

export function webChatStore(admin: Db): WebChatStore {
  return {
    async createSession(visitor, topic) {
      const token = randomBytes(32).toString('base64url')
      const { data, error } = await admin.from('web_chat_sessions').insert({ token_hash: hashChatToken(token), topic, ...cleanVisitor(visitor) }).select(SESSION_COLS).single()
      if (error || !data) return { ok: false, error: 'session_failed' }
      return { ok: true, session: data as WebChatSession, token }
    },
    async findSession(token) {
      if (!isChatToken(token)) return { ok: true, session: null }
      const { data, error } = await admin.from('web_chat_sessions').select(SESSION_COLS).eq('token_hash', hashChatToken(token)).maybeSingle()
      if (error) return { ok: false, error: 'read_error' }
      return { ok: true, session: (data as WebChatSession | null) ?? null }
    },
    async updateVisitor(sessionId, visitor) {
      const clean = Object.fromEntries(Object.entries(cleanVisitor(visitor)).filter(([, v]) => v !== null))
      if (!Object.keys(clean).length) return true
      const { error } = await admin.from('web_chat_sessions').update(clean).eq('id', sessionId)
      return !error
    },
    async addMessage(sessionId, m) {
      const body = String(m.body ?? '').slice(0, 2000)
      const cmid = m.clientMessageId && /^[A-Za-z0-9_-]{8,64}$/.test(m.clientMessageId) ? m.clientMessageId : null
      const ins = await admin.from('web_chat_messages').insert({ session_id: sessionId, direction: m.direction, author: m.direction === 'inbound' ? 'visitor' : 'assistant', body, client_message_id: cmid })
        .select('id, session_id, direction, author, body, created_at').single()
      if (ins.error && (ins.error as { code?: string }).code === '23505' && cmid) {
        const ex = await admin.from('web_chat_messages').select('id, session_id, direction, author, body, created_at').eq('session_id', sessionId).eq('client_message_id', cmid).maybeSingle()
        if (ex.error || !ex.data) return { ok: false, error: 'read_error' }
        return { ok: true, message: ex.data as WebChatMessage, duplicate: true }
      }
      if (ins.error || !ins.data) return { ok: false, error: 'insert_failed' }
      const cur = await admin.from('web_chat_sessions').select('message_count').eq('id', sessionId).maybeSingle()
      const n = Number((cur.data as { message_count?: number } | null)?.message_count ?? 0)
      await admin.from('web_chat_sessions').update({ message_count: Math.min(200, n + 1), last_at: new Date().toISOString() }).eq('id', sessionId)
      return { ok: true, message: ins.data as WebChatMessage, duplicate: false }
    },
    async lastInbound(sessionId) {
      const { data, error } = await admin.from('web_chat_messages').select('id, session_id, direction, author, body, created_at').eq('session_id', sessionId).eq('direction', 'inbound')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) return { ok: false, error: 'read_error' }
      return { ok: true, message: (data as WebChatMessage | null) ?? null }
    },
    async rateCheck(key, scope, limits) {
      try {
        const { data, error } = await admin.rpc('web_chat_rate_check', { p_key: key, p_scope: scope, p_burst: limits.burst, p_hour: limits.hour, p_global_hour: limits.globalHour })
        if (error || !data || typeof (data as { allowed?: unknown }).allowed !== 'boolean') return { ok: false }
        return { ok: true, allowed: (data as { allowed: boolean }).allowed }
      } catch { return { ok: false } }
    },
  }
}
