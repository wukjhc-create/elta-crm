/**
 * Kommunikations-hub fase 3A — regressionstest (ren; ingen DB, intet netværk, ingen afsendelse).
 *   npx tsx scripts/reception-hub-test.ts
 * Mail-/portal-adapter (channel-intake), web-chat (service/svar/vidensbase), flag pr. trin, retention-politik,
 * visninger og at intet i hub-koden kan sende eksternt. DB-reglerne (tråde, retention, RLS) dækkes af
 * cli.ts reception-00250-probe; den rigtige kode mod staging af cli.ts reception-hub-staging.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { ROWS, ID, FACTS, OPEN_CASES } from './reception-fixtures'
import { classifyIdentity } from '../src/lib/reception/identity-match'
import type { BackgroundCapability, SourceRead } from '../src/lib/reception/background-actor'
import { ingestEmailSource, ingestPortalMessageSource, emailDiscoveryEligibility, EMAIL_INGEST_DISCOVERY_DAYS } from '../src/lib/reception/channel-intake'
import { attachmentRefs, webChatToInbound } from '../src/lib/reception/adapters'
import { dedupeKeyFor, validateInbound } from '../src/lib/reception/contract'
import { emailIngestEnabled, portalIngestEnabled, webChatEnabled, webChatAiReplyEnabled, intakeGateEnabled, backfillEnabled, emailIngestSince, EXTERNAL_SENDS_ENABLED } from '../src/lib/reception/flags'
import { RECEPTION_KNOWLEDGE, missingKnowledge, knowledgeQuestion, knowledgeAnswer, isKnown } from '../src/lib/reception/knowledge'
import { composeWebChatReply, aiReplyViolations, SENSITIVE_TOPIC } from '../src/lib/reception/webchat/reply'
import { abuseKey, clientIp, WEBCHAT_LIMITS, WEBCHAT_SESSION_LIFETIME_MIN } from '../src/lib/reception/webchat/abuse'
import type { HandoffReason } from '../src/lib/reception/action-policy'
import { postWebChatMessage, startWebChat } from '../src/lib/reception/webchat/service'
import { cleanVisitor, type WebChatStore, type WebChatSession, type WebChatMessage } from '../src/lib/reception/webchat/store'
import { emergencyReply } from '../src/lib/reception/emergency-policy'
import { clampPolicy, runReceptionRetention, DEFAULT_RETENTION_POLICY } from '../src/lib/reception/retention'
import { parseHenvendelseQuery } from '../src/lib/reception/henvendelser-views'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && note ? ` — ${note}` : ''}`) }
const SECRET = 'test-secret-'.padEnd(40, 'x')
const ACTIVATED = new Date(Date.now() - 10 * 86_400_000).toISOString() // trin A aktiveret for 10 dage siden
const ON = { RECEPTION_EMAIL_INGEST_ENABLED: 'true', RECEPTION_EMAIL_INGEST_SINCE: ACTIVATED, RECEPTION_PORTAL_INGEST_ENABLED: 'true', RECEPTION_WEBCHAT_ENABLED: 'true', RECEPTION_WEBCHAT_RATE_SECRET: SECRET }
const KEY = abuseKey('203.0.113.7', { RECEPTION_WEBCHAT_RATE_SECRET: SECRET })!

/** Falsk læse-port over fixtures (samme form som supabase: from().select()… → { data, error }) */
function fakeReadPort(opts: { fail?: boolean } = {}) {
  return {
    from: (table: string) => ({
      select: (cols?: string) => {
        const st: { ilike?: string; id?: string; customer?: string; start?: number } = {}
        const rows = () => {
          if (table === 'customers') {
            if (st.id) { const f = FACTS[st.id]; return f ? [{ billing_postal_code: f.postalCodes[0], shipping_postal_code: null, billing_address: `${f.streetNames[0]} 1`, shipping_address: null }] : [] }
            return ROWS.customers.filter((c) => !st.ilike || (c.email ?? '').toLowerCase() === st.ilike.toLowerCase() || (c.customer_number ?? '').toLowerCase() === st.ilike.toLowerCase())
          }
          if (table === 'customer_contacts') return ROWS.contacts.filter((c) => !st.ilike || (c.email ?? '').toLowerCase() === st.ilike.toLowerCase())
          if (table === 'leads') return ROWS.leads
          if (table === 'service_cases') return st.customer ? (OPEN_CASES[st.customer] ?? []).map((c) => ({ id: c.id, case_number: c.caseNumber, title: c.title, status: 'in_progress' })) : []
          return []
        }
        const q: Record<string, unknown> = {}
        const self = () => q
        for (const m of ['or', 'order', 'not', 'in', 'limit']) q[m] = self
        q.ilike = (_c: string, v: string) => { st.ilike = v; return q }
        q.eq = (c: string, v: string) => { if (c === 'id') st.id = v; if (c === 'customer_id') st.customer = v; return q }
        q.range = (a: number) => { st.start = a; return q }
        q.maybeSingle = async () => (opts.fail ? { data: null, error: { code: 'x' } } : { data: rows()[0] ?? null, error: null })
        q.then = (res: (v: unknown) => void) => res(opts.fail ? { data: null, error: { code: 'x' } } : { data: (st.start ?? 0) > 0 ? [] : rows(), error: null })
        void cols
        return q
      },
    }),
  }
}

function fakeCap(src: Record<string, SourceRead>, outcome: Record<string, unknown> = { outcome: 'created', conversation_id: ID.hansen, item_id: ID.jensen, actions: [] }, readFail = false, opts: { failFirstIngest?: boolean } = {}) {
  const payloads: Array<Record<string, unknown>> = []
  const reads: string[] = []
  const seen = new Set<string>() // som databasen: samme kilde to gange → duplicate
  let calls = 0
  const cap: BackgroundCapability = {
    readPort: fakeReadPort({ fail: readFail }),
    ingest: async (p) => {
      calls++
      if (opts.failFirstIngest && calls === 1) return { outcome: 'error', error: 'unavailable' }
      payloads.push(p)
      const sid = `${p.source_table}:${p.source_id}`
      if (p.source_id && seen.has(sid)) return { outcome: 'duplicate', conversationId: null }
      if (p.source_id) seen.add(sid)
      const o = outcome
      return o.outcome === 'duplicate' ? { outcome: 'duplicate', conversationId: null } : { outcome: o.outcome as 'created' | 'appended', conversationId: String(o.conversation_id), itemId: String(o.item_id), actions: [] }
    },
    readSource: async (t, id) => { reads.push(`${t}:${id}`); return src[`${t}:${id}`] ?? { ok: false, error: 'not_found' } },
    readSourceBody: async (t, id) => { reads.push(`body:${t}:${id}`); return src[`body:${t}:${id}`] ?? { ok: true, row: { id, body_text: null, body_html: null } } },
  }
  return { cap, payloads, reads }
}

const MAIL = '00000000-0000-4000-8000-00000000e001'
const PORTAL = '00000000-0000-4000-8000-00000000f001'
const now = new Date().toISOString()
const mailRow = (over: Record<string, unknown> = {}) => ({ ok: true as const, row: { id: MAIL, subject: 'Batteri går offline', sender_email: 'hansen@example.dk', sender_name: 'Hans', body_preview: 'Mit batteri går offline igen.', received_at: now, created_at: now, customer_id: null, customer_contact_id: null, linked_by: null, link_status: 'pending', has_attachments: false, attachment_urls: [], service_case_id: null, ...over } })

function fakeStore(opts: { rate?: 'allow' | 'deny' | 'fail' } = {}) {
  const sessions = new Map<string, WebChatSession & { token: string }>()
  const msgs: WebChatMessage[] = []
  const rateCalls: Array<{ key: string; scope: string }> = []
  let n = 0
  const store: WebChatStore = {
    async rateCheck(key, scope) { rateCalls.push({ key, scope }); return opts.rate === 'fail' ? { ok: false } : { ok: true, allowed: opts.rate !== 'deny' } },
    async lastInbound(sessionId) { const m = [...msgs].reverse().find((x) => x.session_id === sessionId && x.direction === 'inbound'); return { ok: true, message: m ?? null } },
    async createSession(visitor, topic) {
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, token = `t${String(n).padStart(42, 'x')}`
      const s = { id, token, ...(cleanVisitor(visitor) as Record<string, string | null>), topic, message_count: 0, closed_at: null, created_at: new Date().toISOString() } as unknown as WebChatSession & { token: string }
      sessions.set(token, s); return { ok: true, session: s, token }
    },
    async findSession(token) { return { ok: true, session: sessions.get(token) ?? null } },
    async updateVisitor(id, v) { for (const s of sessions.values()) if (s.id === id) Object.assign(s, Object.fromEntries(Object.entries(cleanVisitor(v)).filter(([, x]) => x !== null))); return true },
    async addMessage(sessionId, m) {
      const dup = m.clientMessageId ? msgs.find((x) => x.session_id === sessionId && (x as unknown as { cmid?: string }).cmid === m.clientMessageId) : undefined
      if (dup) return { ok: true, message: dup, duplicate: true }
      const msg = { id: `00000000-0000-4000-9000-${String(msgs.length + 1).padStart(12, '0')}`, session_id: sessionId, direction: m.direction, author: m.direction === 'inbound' ? 'visitor' : 'assistant', body: m.body, created_at: new Date().toISOString(), cmid: m.clientMessageId } as unknown as WebChatMessage
      msgs.push(msg); for (const s of sessions.values()) if (s.id === sessionId) s.message_count++
      return { ok: true, message: msg, duplicate: false }
    },
  }
  return { store, msgs, rateCalls, sessions }
}

async function chat(text: string, visitor: Record<string, string> = {}, topic = 'general', extra: { rephrase?: (b: string, f: Record<string, string>) => Promise<string | null>; env?: Record<string, string> } = {}) {
  const { store, msgs, rateCalls, sessions } = fakeStore()
  const { cap, payloads } = fakeCap({})
  const env = { ...ON, ...(extra.env ?? {}) }
  const s = await startWebChat({ visitor, topic, abuseKey: KEY }, { env, store, capability: cap })
  if (!s.ok) throw new Error('start')
  const r = await postWebChatMessage({ token: s.token, text, clientMessageId: 'msgid00001', abuseKey: KEY }, { env, store, capability: cap, rephrase: extra.rephrase })
  return { r, payloads, msgs, store, token: s.token, cap, env, rateCalls, sessions }
}

async function main() {
  // ── 1. Flag pr. aktiveringstrin (ingen hovedafbryder) ─────────────────────────────────────────────────────────
  ok('flag: alle FRA som standard', !emailIngestEnabled({}) && !portalIngestEnabled({}) && !webChatEnabled({}) && !webChatAiReplyEnabled({}))
  ok('flag: mail tændt tænder IKKE portal/chat/baggrund', intakeGateEnabled('email', { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }) && !intakeGateEnabled('portal', { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }) && !intakeGateEnabled('webchat', { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }) && !intakeGateEnabled('background', { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }))
  ok('flag: RECEPTION_BACKGROUND_ENABLED tænder ikke mail/portal/chat', !intakeGateEnabled('email', { RECEPTION_BACKGROUND_ENABLED: 'true' }) && !intakeGateEnabled('portal', { RECEPTION_BACKGROUND_ENABLED: 'true' }) && !intakeGateEnabled('webchat', { RECEPTION_BACKGROUND_ENABLED: 'true' }))
  ok('flag: AI-svar kræver også web-chat-flaget', !webChatAiReplyEnabled({ RECEPTION_WEBCHAT_AI_REPLY_ENABLED: 'true', RECEPTION_WEBCHAT_RATE_SECRET: SECRET }) && webChatAiReplyEnabled({ RECEPTION_WEBCHAT_ENABLED: 'true', RECEPTION_WEBCHAT_AI_REPLY_ENABLED: 'true', RECEPTION_WEBCHAT_RATE_SECRET: SECRET }))
  ok('ekstern afsendelse: konstant false', EXTERNAL_SENDS_ENABLED === false)
  ok('flag: web-chat kan IKKE slås til uden misbrugsværn (RECEPTION_WEBCHAT_RATE_SECRET)', !webChatEnabled({ RECEPTION_WEBCHAT_ENABLED: 'true' }) && !webChatEnabled({ RECEPTION_WEBCHAT_ENABLED: 'true', RECEPTION_WEBCHAT_RATE_SECRET: 'kort' }) && webChatEnabled({ RECEPTION_WEBCHAT_ENABLED: 'true', RECEPTION_WEBCHAT_RATE_SECRET: SECRET }))
  ok('flag: backfill (trin C) FRA som standard — "Hent nye" teknisk spærret', !backfillEnabled({}) && backfillEnabled({ RECEPTION_BACKFILL_ENABLED: 'true' }))
  ok('flag: RECEPTION_EMAIL_INGEST_SINCE skal være et ISO-tidspunkt', emailIngestSince({}) === null && emailIngestSince({ RECEPTION_EMAIL_INGEST_SINCE: 'i går' }) === null && emailIngestSince({ RECEPTION_EMAIL_INGEST_SINCE: ACTIVATED })?.toISOString() === ACTIVATED)

  // ── 2. Mail → Henvendelser ──────────────────────────────────────────────────────────────────────────────────
  const off = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow() })
  const rOff = await ingestEmailSource(MAIL, { env: {}, capability: off.cap })
  ok('mail: flag FRA → disabled, kilden læses ikke', rOff.outcome === 'disabled' && off.reads.length === 0)
  const un = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ sender_email: 'ukendt@example.org' }) })
  const rUn = await ingestEmailSource(MAIL, { env: ON, capability: un.cap })
  ok('mail ny ukoblet → created; ingen bekræftet kunde, ingen kandidat', rUn.outcome === 'created' && !un.payloads[0].confirmed_customer_id && !un.payloads[0].customer_candidate_id, JSON.stringify(un.payloads[0]?.customer_match_state))
  ok('mail ukoblet: match-tilstand no_match (ikke læsefejl)', un.payloads[0].customer_match_state === 'no_match', String(un.payloads[0].customer_match_state))
  ok('mail: kun kilde-reference sendes (source_table/source_id), ingen kopi af kildetabellen', un.payloads[0].source_table === 'incoming_emails' && un.payloads[0].source_id === MAIL && !('body_text' in un.payloads[0]))
  const auto = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ customer_id: ID.jensen, linked_by: 'auto', link_status: 'linked' }) })
  await ingestEmailSource(MAIL, { env: ON, capability: auto.cap })
  ok('mail automatisk koblet → kandidat = kildens kunde (aldrig bekræftet)', auto.payloads[0].customer_candidate_id === ID.jensen && !auto.payloads[0].confirmed_customer_id)
  const man = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ customer_id: ID.nielsen, linked_by: 'manual', link_status: 'linked' }) })
  await ingestEmailSource(MAIL, { env: ON, capability: man.cap })
  ok('mail manuelt koblet → bekræftet kunde = kildens (motorens afsender-match overskriver ikke)', man.payloads[0].confirmed_customer_id === ID.nielsen && !man.payloads[0].customer_candidate_id)
  const known = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow() })
  await ingestEmailSource(MAIL, { env: ON, capability: known.cap })
  ok('mail ukoblet fra kendt afsender → deterministisk KANDIDAT (samme matcher som alle kanaler)', known.payloads[0].customer_candidate_id === ID.hansen && known.payloads[0].customer_match_state === 'unique_match')
  const amb = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ sender_email: 'x@example.org' }) })
  // tvetydig: samme e-mail på to kunder (fixtures har kun telefon-tvetydighed — lav en midlertidig)
  const savedEmail = ROWS.customers[3].email
  ROWS.customers[3].email = 'x@example.org'; ROWS.customers[4].email = 'x@example.org'
  await ingestEmailSource(MAIL, { env: ON, capability: amb.cap })
  ROWS.customers[3].email = savedEmail; ROWS.customers[4].email = null
  ok('mail tvetydig afsender forbliver tvetydig (ingen kandidat)', amb.payloads[0].customer_match_state === 'ambiguous' && !amb.payloads[0].customer_candidate_id, String(amb.payloads[0].customer_match_state))
  const dup = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow() }, { outcome: 'duplicate' })
  ok('mail dublet-levering → duplicate (ingen ny henvendelse)', (await ingestEmailSource(MAIL, { env: ON, capability: dup.cap })).outcome === 'duplicate')
  const rerr = fakeCap({ [`incoming_emails:${MAIL}`]: { ok: false, error: 'read_error' } })
  const rRe = await ingestEmailSource(MAIL, { env: ON, capability: rerr.cap })
  ok('mail læsefejl → read_error (aldrig "ukoblet"), intet indtag', rRe.outcome === 'read_error' && rerr.payloads.length === 0)
  const matchErr = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow() }, undefined, true)
  await ingestEmailSource(MAIL, { env: ON, capability: matchErr.cap })
  ok('mail: kunde-OPSLAG fejler → match-tilstand read_error (ikke no_match)', matchErr.payloads[0]?.customer_match_state === 'read_error', String(matchErr.payloads[0]?.customer_match_state))
  ok('mail ikke fundet → not_found', (await ingestEmailSource(MAIL, { env: ON, capability: fakeCap({}).cap })).outcome === 'not_found')
  const own = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ sender_email: 'kontakt@eltasolar.dk' }) })
  ok('mail fra egen postkasse/domæne → skipped', (await ingestEmailSource(MAIL, { env: ON, capability: own.cap })).reason === 'own_mailbox' && own.payloads.length === 0)
  // Final review §2 — UDFALD: mailen er modtaget for længe siden, men først OPDAGET nu (sync var nede) → stadig ny
  for (const [label, hours] of [['49 timer', 49], ['3 dage', 72], ['7 dage', 168]] as const) {
    const o = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ received_at: new Date(Date.now() - hours * 3_600_000).toISOString(), created_at: new Date().toISOString() }) })
    const r = await ingestEmailSource(MAIL, { env: ON, capability: o.cap })
    ok(`udfald ${label}: mail modtaget for ${label} siden, opdaget i dag → indtaget (forsvinder ikke pga. alder)`, r.outcome === 'created' && o.payloads.length === 1, JSON.stringify(r))
  }
  const hist = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ received_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), created_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }) })
  ok('genforsøg af gammel mail opdaget FØR aktiveringen → skipped (ingen stille historik-import)', (await ingestEmailSource(MAIL, { env: ON, capability: hist.cap })).reason === 'discovered_before_activation' && hist.payloads.length === 0)
  const oldDisc = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ created_at: new Date(Date.now() - (EMAIL_INGEST_DISCOVERY_DAYS + 1) * 86_400_000).toISOString() }) })
  ok('mail opdaget efter aktivering men uden for genforsøgsvinduet → skipped (afgrænset)', (await ingestEmailSource(MAIL, { env: { ...ON, RECEPTION_EMAIL_INGEST_SINCE: new Date(Date.now() - 60 * 86_400_000).toISOString() }, capability: oldDisc.cap })).reason === 'discovery_window' && oldDisc.payloads.length === 0)
  const noSince = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow() })
  ok('trin A uden RECEPTION_EMAIL_INGEST_SINCE → intet indtag (fail closed)', (await ingestEmailSource(MAIL, { env: { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }, capability: noSince.cap })).reason === 'since_not_configured' && noSince.payloads.length === 0)
  ok('opdagelses-reglen bruger aldrig modtaget-tiden', emailDiscoveryEligibility(new Date().toISOString(), ON, Date.now()).ok && !emailDiscoveryEligibility(null, ON, Date.now()).ok)
  const plain = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow() })
  await ingestEmailSource(MAIL, { env: ON, capability: plain.cap })
  ok('almindelig mail: brødtekst (body_html/body_text) læses IKKE (kun webformularer)', !plain.reads.some((r) => r.startsWith('body:')))
  const form = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ sender_email: 'submissions@formsubmit.co', subject: 'Ny henvendelse fra hjemmesiden' }), [`body:incoming_emails:${MAIL}`]: { ok: true, row: { id: MAIL, body_text: 'name: Test\nmessage: Hej', body_html: null } } })
  await ingestEmailSource(MAIL, { env: ON, capability: form.cap })
  ok('webformular: brødteksten læses (fast kolonneliste) og indtages', form.reads.includes(`body:incoming_emails:${MAIL}`) && form.payloads.length === 1)
  const formErr = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ sender_email: 'submissions@formsubmit.co', subject: 'Ny henvendelse fra hjemmesiden' }), [`body:incoming_emails:${MAIL}`]: { ok: false, error: 'read_error' } })
  ok('webformular: læsefejl på brødtekst → read_error (aldrig indtaget som tom)', (await ingestEmailSource(MAIL, { env: ON, capability: formErr.cap })).outcome === 'read_error' && formErr.payloads.length === 0)
  const ign = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ link_status: 'ignored' }) })
  ok('mail ignoreret (spam/nyhedsbrev) → skipped', (await ingestEmailSource(MAIL, { env: ON, capability: ign.cap })).reason === 'ignored' && ign.payloads.length === 0)
  const emer = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ subject: 'Det brænder i tavlen', body_preview: 'Der kommer røg ud af eltavlen' }) })
  await ingestEmailSource(MAIL, { env: ON, capability: emer.cap })
  ok('mail nød → emergency + handoff (kun forslag; intet udført)', emer.payloads[0].urgency === 'emergency' && emer.payloads[0].status === 'handoff' && (emer.payloads[0].actions as Array<{ execute: boolean }>).every((a) => !a.execute))
  const thr = await ingestEmailSource(MAIL, { env: ON, capability: fakeCap({ [`incoming_emails:${MAIL}`]: mailRow() }, { outcome: 'appended', conversation_id: ID.hansen, item_id: ID.jensen }).cap })
  ok('mail i åben tråd → appended (databasen afgør tråden)', thr.outcome === 'appended')
  const boom: BackgroundCapability = { readPort: fakeReadPort(), ingest: async () => { throw new Error('x') }, readSource: async () => mailRow(), readSourceBody: async () => ({ ok: false, error: 'read_error' }) }
  ok('mail: undtagelse → error (vælter aldrig mail-sync)', (await ingestEmailSource(MAIL, { env: ON, capability: boom })).outcome === 'error')

  // ── 3. Portal → Henvendelser ────────────────────────────────────────────────────────────────────────────────
  const prow = (over: Record<string, unknown> = {}) => ({ ok: true as const, row: { id: PORTAL, customer_id: ID.hansen, sender_type: 'customer', sender_name: 'Hans', message: 'Hvornår kommer I?', attachments: [{ name: 'billede.jpg', url: 'https://storage/sign/x?token=SECRET', size: 9, type: 'image/jpeg' }], created_at: now, offer_id: null, ...over } })
  const pOff = fakeCap({ [`portal_messages:${PORTAL}`]: prow() })
  ok('portal: flag FRA → disabled', (await ingestPortalMessageSource(PORTAL, { env: {}, capability: pOff.cap })).outcome === 'disabled' && pOff.reads.length === 0)
  const p1 = fakeCap({ [`portal_messages:${PORTAL}`]: prow() })
  ok('portal kundebesked → created', (await ingestPortalMessageSource(PORTAL, { env: ON, capability: p1.cap })).outcome === 'created')
  ok('portal: bekræftet kunde = portal-tokenets kunde', p1.payloads[0].confirmed_customer_id === ID.hansen)
  ok('portal: kunde har én åben sag → sagskandidat (bekræftet sag afledes kun af tilbuddet i DB)', p1.payloads[0].case_candidate_id === ID.case1824 && !p1.payloads[0].confirmed_case_id)
  const refs = attachmentRefs(prow().row.attachments)
  ok('portal-vedhæftning: kun navn/type — aldrig URL/token', refs.length === 1 && refs[0].name === 'billede.jpg' && !JSON.stringify(refs).includes('SECRET') && !JSON.stringify(p1.payloads[0]).includes('SECRET'))
  const pEmp = fakeCap({ [`portal_messages:${PORTAL}`]: prow({ sender_type: 'employee' }) })
  ok('portal: medarbejderens egen besked → skipped', (await ingestPortalMessageSource(PORTAL, { env: ON, capability: pEmp.cap })).reason === 'not_customer_message')
  const pAtt = fakeCap({ [`portal_messages:${PORTAL}`]: prow({ message: '' }) })
  await ingestPortalMessageSource(PORTAL, { env: ON, capability: pAtt.cap })
  ok('portal: kun vedhæftning ≠ manglende indhold (ingen transcript-handoff)', !((pAtt.payloads[0].handoff_reasons as string[]) ?? []).includes('transcript_unavailable'))

  // ── 4. Web-chat (samme motor/politik) ──────────────────────────────────────────────────────────────────────
  const off2 = await startWebChat({}, { env: {} })
  ok('web-chat: flag FRA → disabled (start)', !off2.ok && off2.error === 'disabled')
  ok('web-chat: flag FRA → disabled (besked)', (await postWebChatMessage({ token: 'x', text: 'hej' }, { env: {} })).ok === false)
  const c0 = await chat('Hej, jeg har et spørgsmål', {})
  ok('web-chat ukendt besøgende → svar beder om kontaktoplysninger; ingen kandidat', c0.r.ok && !c0.r.duplicate && /telefonnummer eller din e-mail/.test(c0.r.reply ?? '') && !c0.payloads[0].customer_candidate_id)
  ok('web-chat: svaret gemmes som udgående besked og føjes til tråden (2 indtag: ind + ud)', c0.msgs.length === 2 && c0.msgs[1].direction === 'outbound' && c0.payloads.length === 2 && c0.payloads[1].source_table === 'web_chat_messages')
  ok('web-chat: udgående svar indtages uden handlinger', ((c0.payloads[1].actions as unknown[]) ?? []).length === 0)
  const c1 = await chat('Jeg har et spørgsmål til min sag', { email: 'hansen@example.dk', name: 'Hans' }, 'existing_case')
  ok('web-chat kendt kunde → KANDIDAT (aldrig bekræftet), samme matcher', c1.payloads[0].customer_candidate_id === ID.hansen && !c1.payloads[0].confirmed_customer_id)
  ok('web-chat kendt kunde uden bekræftelse → beder om postnr./vejnavn, intet kundespecifikt', c1.r.ok && /postnummer og vejnavn/.test((c1.r as { reply: string }).reply) && !/SVC-|status:/i.test((c1.r as { reply: string }).reply))
  const c1v = await chat('Hvad er status på min sag?', { email: 'hansen@example.dk', postalCode: '8000', address: 'Solvej 1' }, 'existing_case')
  ok('web-chat bekræftet (postnr.+vejnavn) → kun status-KATEGORI (deterministisk L2)', c1v.r.ok && /har status: I gang/.test((c1v.r as { reply: string }).reply) && !/SVC-01824/.test((c1v.r as { reply: string }).reply), (c1v.r as { reply?: string }).reply)
  const c2 = await chat('Hej', { phone: '30303030' })
  ok('web-chat tvetydig (nummer hos to kunder) → ambiguous, ingen kandidat', c2.payloads[0].customer_match_state === 'ambiguous' && !c2.payloads[0].customer_candidate_id)
  const c3 = await chat('Hvad koster et solcelleanlæg?', { phone: '99887766' }, 'quote')
  ok('web-chat tilbud → ingen pris, forespørgslen går videre', c3.r.ok && /kan ikke give en pris/.test((c3.r as { reply: string }).reply) && !/\d+\s*kr/i.test((c3.r as { reply: string }).reply))
  ok('web-chat tilbud → opgave-forslag til salg', (c3.payloads[0].actions as Array<{ action_type: string; payload: { team?: string } }>).some((a) => a.action_type === 'create_task' && a.payload.team === 'salg'))
  const c4 = await chat('Mit batteri går offline hele tiden', { phone: '99887766' }, 'service')
  ok('web-chat servicehenvendelse → service_fault-forslag (sag/opgave + billeder)', c4.payloads[0].intent === 'service_fault' && (c4.payloads[0].actions as Array<{ action_type: string }>).some((a) => a.action_type === 'request_documents'))
  let aiCalled = false
  const c5 = await chat('Der kommer røg og gnister fra eltavlen!', { phone: '99887766' }, 'general', { env: { RECEPTION_WEBCHAT_AI_REPLY_ENABLED: 'true' }, rephrase: async () => { aiCalled = true; return 'Slå hovedafbryderen fra.' } })
  ok('web-chat NØD → PRÆCIS den godkendte nød-tekst', c5.r.ok && (c5.r as { reply: string }).reply === emergencyReply(), (c5.r as { reply?: string }).reply)
  ok('web-chat NØD → AI kaldes ikke, handoff + emergency', !aiCalled && (c5.r as { handoff: boolean }).handoff && c5.payloads[0].urgency === 'emergency')
  const c6 = await chat('Jeg vil gerne tale med en medarbejder', { phone: '99887766' }, 'human')
  ok('web-chat beder om menneske → handoff human_requested', (c6.payloads[0].handoff_reasons as string[]).includes('human_requested') && (c6.r as { handoff: boolean }).handoff)
  const c7 = await chat('hmm ok', { phone: '99887766' })
  ok('web-chat lav sikkerhed → handoff low_confidence (ingen gæt)', (c7.payloads[0].handoff_reasons as string[]).includes('low_confidence'), JSON.stringify(c7.payloads[0].handoff_reasons))
  const again = await postWebChatMessage({ token: c0.token, text: 'Hej, jeg har et spørgsmål', clientMessageId: 'msgid00001', abuseKey: KEY }, { env: ON, store: c0.store, capability: c0.cap })
  ok('web-chat gentaget besked (samme klient-id) → duplicate, intet nyt svar', again.ok && again.duplicate && c0.msgs.length === 2)
  const again2 = await postWebChatMessage({ token: c0.token, text: '  hej, JEG har et spørgsmål ', clientMessageId: 'msgid00099', abuseKey: KEY }, { env: ON, store: c0.store, capability: c0.cap })
  ok('web-chat samme tekst igen med NY klient-id → gentagelse: ingen ny række, intet nyt svar', again2.ok && again2.duplicate && c0.msgs.length === 2)
  const tooLong = await postWebChatMessage({ token: c0.token, text: 'x'.repeat(1001), abuseKey: KEY }, { env: ON, store: c0.store, capability: c0.cap })
  ok('web-chat: for lang besked afvises', !tooLong.ok && tooLong.error === 'invalid')
  ok('web-chat: ukendt session afvises', (await postWebChatMessage({ token: 'y'.repeat(43), text: 'hej', abuseKey: KEY }, { env: ON, store: c0.store, capability: c0.cap })).ok === false)

  // ── 4b. Misbrugsværn (final review §3) ─────────────────────────────────────────────────────────────────────
  ok('værn: start og besked tjekkes server-side (begge scopes)', c0.rateCalls.some((x) => x.scope === 'start') && c0.rateCalls.some((x) => x.scope === 'message'))
  ok('værn: nøglen er HMAC (64 hex), indeholder ikke IP, kan ikke laves uden hemmelighed', /^[0-9a-f]{64}$/.test(KEY) && !KEY.includes('203') && abuseKey('203.0.113.7', {}) === null && abuseKey('203.0.113.7', { RECEPTION_WEBCHAT_RATE_SECRET: SECRET }) === KEY && abuseKey('203.0.113.8', { RECEPTION_WEBCHAT_RATE_SECRET: SECRET }) !== KEY)
  ok('værn: IP fra første x-forwarded-for; ukendt → fælles spand', clientIp(new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })) === '198.51.100.1' && clientIp(new Headers()) === 'unknown')
  ok('værn: fornuftige grænser (burst + rullende time + globalt loft)', WEBCHAT_LIMITS.start.burst <= 5 && WEBCHAT_LIMITS.start.hour <= 20 && WEBCHAT_LIMITS.message.burst <= 10 && WEBCHAT_LIMITS.message.hour <= 100 && WEBCHAT_LIMITS.message.globalHour > 0)
  const deny = fakeStore({ rate: 'deny' })
  const dStart = await startWebChat({ abuseKey: KEY }, { env: ON, store: deny.store, capability: fakeCap({}).cap })
  ok('værn: over grænsen → start afvist (limit), ingen session oprettet', !dStart.ok && dStart.error === 'limit' && deny.sessions.size === 0)
  const failS = fakeStore({ rate: 'fail' })
  const fStart = await startWebChat({ abuseKey: KEY }, { env: ON, store: failS.store, capability: fakeCap({}).cap })
  ok('værn: fejl i værnet → afvist (fail closed)', !fStart.ok && fStart.error === 'unavailable' && failS.sessions.size === 0)
  ok('værn: manglende nøgle → afvist', (await startWebChat({}, { env: ON, store: fakeStore().store, capability: fakeCap({}).cap })).ok === false)
  const dm = fakeStore()
  const dmCap = fakeCap({})
  const dmS = await startWebChat({ abuseKey: KEY }, { env: ON, store: dm.store, capability: dmCap.cap })
  if (dmS.ok) {
    const dmStore = { ...dm.store, rateCheck: async () => ({ ok: true as const, allowed: false }) }
    const dmR = await postWebChatMessage({ token: dmS.token, text: 'hej', abuseKey: KEY }, { env: ON, store: dmStore, capability: dmCap.cap })
    ok('værn: besked over grænsen → afvist før noget gemmes/indtages', !dmR.ok && dmR.error === 'limit' && dm.msgs.length === 0 && dmCap.payloads.length === 0)
    const exp = await postWebChatMessage({ token: dmS.token, text: 'hej', abuseKey: KEY }, { env: ON, store: dm.store, capability: dmCap.cap, now: () => Date.now() + (WEBCHAT_SESSION_LIFETIME_MIN + 1) * 60_000 })
    ok('værn: session ældre end maks. levetid → afvist (start ny)', !exp.ok && exp.error === 'session_unknown' && dm.msgs.length === 0)
  }
  const maxS = fakeStore()
  const maxCap = fakeCap({})
  const mS = await startWebChat({ abuseKey: KEY }, { env: ON, store: maxS.store, capability: maxCap.cap })
  if (mS.ok) {
    for (const s of maxS.sessions.values()) s.message_count = 30
    const mr = await postWebChatMessage({ token: mS.token, text: 'hej', abuseKey: KEY }, { env: ON, store: maxS.store, capability: maxCap.cap })
    ok('værn: maks. beskeder pr. session → afvist', !mr.ok && mr.error === 'limit')
  }
  const lost = fakeStore()
  const lostCap = fakeCap({}, undefined, false, { failFirstIngest: true })
  const lS = await startWebChat({ abuseKey: KEY }, { env: ON, store: lost.store, capability: lostCap.cap })
  if (lS.ok) {
    const l1 = await postWebChatMessage({ token: lS.token, text: 'Min inverter blinker rødt', abuseKey: KEY }, { env: ON, store: lost.store, capability: lostCap.cap })
    const l2 = await postWebChatMessage({ token: lS.token, text: 'Min inverter blinker rødt', abuseKey: KEY }, { env: ON, store: lost.store, capability: lostCap.cap })
    ok('gentagelse efter fejlet indtag → den gemte besked registreres nu (ingen tabt besked, ingen dobbelt række)', !l1.ok && l2.ok && !l2.duplicate && lost.msgs.filter((m) => m.direction === 'inbound').length === 1 && lostCap.payloads.length === 2)
  }
  // Intet kunde-orakel: kendt nummer med FORKERT postnummer svarer præcis som et ukendt nummer
  const orKnown = await chat('Hvad er status på min sag?', { email: 'hansen@example.dk', postalCode: '9999', address: 'Forkertvej 1' }, 'existing_case')
  const orUnknown = await chat('Hvad er status på min sag?', { email: 'ingen@example.org', postalCode: '9999', address: 'Forkertvej 1' }, 'existing_case')
  ok('intet kunde-orakel: fejlet bekræftelse (kendt kunde) = samme svar som ukendt afsender', orKnown.r.ok && orUnknown.r.ok && (orKnown.r as { reply: string }).reply === (orUnknown.r as { reply: string }).reply, `${(orKnown.r as { reply?: string }).reply} | ${(orUnknown.r as { reply?: string }).reply}`)
  ok('intet kunde-orakel: handoff-flaget til besøgende er ens', (orKnown.r as { handoff?: boolean }).handoff === (orUnknown.r as { handoff?: boolean }).handoff, `${(orKnown.r as { handoff?: boolean }).handoff} | ${(orUnknown.r as { handoff?: boolean }).handoff}`)
  const c8 = await chat('Hvad er jeres åbningstider?', { phone: '99887766' })
  ok('web-chat vidensspørgsmål med UKENDT fakta → ingen gæt, en medarbejder vender tilbage', c8.r.ok && /ikke svare sikkert/.test((c8.r as { reply: string }).reply) && !/\d{1,2}[.:]\d{2}/.test((c8.r as { reply: string }).reply))
  const c9 = await chat('Hvad er jeres e-mail?', { phone: '99887766' })
  ok('web-chat vidensspørgsmål med KENDT fakta → ordret fra vidensbasen', c9.r.ok && (c9.r as { reply: string }).reply.includes('kontakt@eltasolar.dk'))
  const c10 = await chat('Hvad er jeres e-mail?', { phone: '99887766' }, 'general', { env: { RECEPTION_WEBCHAT_AI_REPLY_ENABLED: 'true' }, rephrase: async () => 'Skriv til kontakt@eltasolar.dk — vi svarer inden for 2 timer.' })
  ok('web-chat AI-svar med nyt tal/løfte → afvist, fast svar bruges', c10.r.ok && !(c10.r as { reply: string }).reply.includes('2 timer') && (c10.r as { source: string }).source === 'knowledge')
  const c11 = await chat('Hvad er jeres e-mail?', { phone: '99887766' }, 'general', { env: { RECEPTION_WEBCHAT_AI_REPLY_ENABLED: 'true' }, rephrase: async () => 'Du kan skrive til os på kontakt@eltasolar.dk.' })
  ok('web-chat AI-omformulering uden nye fakta → accepteret', c11.r.ok && (c11.r as { source: string }).source === 'ai')

  // ── 5. Svar-værn og vidensbase ──────────────────────────────────────────────────────────────────────────────
  ok('AI-værn: nyt tal afvises', aiReplyViolations('Vi kommer om 3 dage', 'Tak', {}).includes('new_number'))
  ok('AI-værn: el-instruktion afvises', aiReplyViolations('Slå strømmen fra ved tavlen', 'Tak', {}).includes('safety_instruction'))
  ok('AI-værn: pris afvises', aiReplyViolations('Det koster 5000 kr', 'Tak 5000', {}).includes('policy'))
  ok('AI-værn: ny URL/e-mail afvises', aiReplyViolations('Se www.x.dk', 'Tak', {}).includes('new_url') && aiReplyViolations('skriv til a@b.dk', 'Tak', {}).includes('new_email'))
  const handoffReply = await composeWebChatReply({ turn: { handoff: { reasons: ['human_requested'], team: 'kontor', urgency: 'normal', suggestedNextAction: '' }, needsVerification: false, commitmentsRefused: [], reply: 'Jeg sender din henvendelse videre.', intent: 'callback_request' }, text: 'x', hasContact: true, rephrase: async () => { throw new Error('må ikke kaldes') } })
  ok('handoff-svar formuleres aldrig af AI (politik før model)', handoffReply.source === 'policy')

  // Final review §7 — vidensundtagelsens prioritet: KUN sikre generelle firmafakta; alt andet går forud
  const kq = 'Hvad er jeres e-mail?'
  const turnFor = (reasons: HandoffReason[], over: Partial<{ needsVerification: boolean; commitmentsRefused: string[]; intent: string }> = {}) => ({
    handoff: reasons.length ? { reasons, team: 'kontor' as const, urgency: 'normal' as const, suggestedNextAction: '' } : null,
    needsVerification: over.needsVerification ?? false, commitmentsRefused: (over.commitmentsRefused ?? []) as never[], reply: 'MOTORENS SVAR', intent: (over.intent ?? 'general_question') as never,
  })
  const base = await composeWebChatReply({ turn: turnFor(['low_confidence']), text: kq, hasContact: true })
  ok('viden: generelt firmafaktum + KUN lav sikkerhed → vidensbase-svar', base.source === 'knowledge' && base.text.includes('kontakt@eltasolar.dk'))
  const emerg = await composeWebChatReply({ turn: turnFor(['safety_emergency', 'low_confidence']), text: kq, hasContact: true })
  ok('viden må ikke tilsidesætte NØD', emerg.source === 'emergency' && emerg.text === emergencyReply())
  for (const reason of ['human_requested', 'ambiguous_identity', 'identity_read_error', 'verification_failed', 'customer_dispute', 'unhappy_customer', 'invoice_change', 'cancellation', 'warranty', 'compliance', 'commercial_negotiation', 'urgent_outage'] as HandoffReason[]) {
    const r = await composeWebChatReply({ turn: turnFor([reason, 'low_confidence']), text: kq, hasContact: true })
    ok(`viden må ikke tilsidesætte ${reason}`, r.source === 'policy' && r.text.startsWith('MOTORENS SVAR'), r.source)
  }
  const verify = await composeWebChatReply({ turn: turnFor(['low_confidence'], { needsVerification: true }), text: kq, hasContact: true })
  ok('viden må ikke tilsidesætte identitets-bekræftelse', verify.source === 'policy')
  for (const c of ['quote_binding_price', 'promise_date', 'warranty_decision', 'compliance_answer', 'cancel_order', 'alter_invoice']) {
    const r = await composeWebChatReply({ turn: turnFor(['low_confidence'], { commitmentsRefused: [c] }), text: kq, hasContact: true })
    ok(`viden må ikke tilsidesætte afvist tilsagn ${c}`, r.source === 'policy', r.source)
  }
  for (const intent of ['existing_case_status', 'invoice_question', 'offer_question', 'appointment_request', 'service_fault', 'emergency_safety']) {
    const r = await composeWebChatReply({ turn: turnFor(['low_confidence'], { intent }), text: kq, hasContact: true })
    ok(`viden kun ved generel intent — ikke ${intent} (kunde/sag/faktura/tilbud/aftale)`, r.source === 'policy', r.source)
  }
  for (const t of ['Hvad er jeres e-mail? Jeg vil klage over fakturaen', 'Hvad er jeres e-mail, hvad koster det?', 'Hvad er jeres e-mail, hvornår kan I komme?', 'Hvad er jeres e-mail? Er det lovligt?', 'Hvad er jeres e-mail? Jeg vil annullere ordren', 'Hvad er jeres e-mail? Hvad er status på min sag', 'Hvad er jeres e-mail, er det dækket af garantien?']) {
    const r = await composeWebChatReply({ turn: turnFor(['low_confidence']), text: t, hasContact: true })
    ok(`viden: følsomt emne i teksten går forud ("${t.slice(24, 60)}")`, r.source === 'policy' && SENSITIVE_TOPIC.test(t), r.source)
  }
  const unknownFact = await composeWebChatReply({ turn: turnFor(['low_confidence']), text: 'Hvad er jeres åbningstider?', hasContact: true })
  ok('viden: ukendt firmafaktum forbliver ukendt (ingen gæt)', unknownFact.source === 'knowledge' && /ikke svare sikkert/.test(unknownFact.text) && !/\d/.test(unknownFact.text))
  ok('viden: følsomt-emne-filter rammer ikke almindelige firmaspørgsmål', !SENSITIVE_TOPIC.test(kq) && !SENSITIVE_TOPIC.test('Hvilket område dækker I?') && !SENSITIVE_TOPIC.test('Hvordan foregår et servicebesøg?'))
  ok('vidensbase: ukendte felter er null (intet opfundet)', !isKnown(RECEPTION_KNOWLEDGE.opening_hours) && !isKnown(RECEPTION_KNOWLEDGE.service_area) && !isKnown(RECEPTION_KNOWLEDGE.contact_phone))
  ok('vidensbase: hver kendt fakta har en kilde', Object.values(RECEPTION_KNOWLEDGE).every((f) => (f.value === null) === (f.source === null)))
  ok('vidensbase: liste over manglende felter til Henrik', missingKnowledge().length >= 8, missingKnowledge().join(','))
  ok('vidensbase: deterministisk spørgsmål → felt', knowledgeQuestion('Hvornår har I åbent?') === 'opening_hours' && knowledgeQuestion('Mit batteri er i stykker') === null)
  ok('vidensbase: ukendt svar lover intet', !knowledgeAnswer('service_area').known && /medarbejder vender tilbage/.test(knowledgeAnswer('service_area').text))
  const srcFiles = ['src/lib/reception/webchat/reply.ts', 'src/lib/reception/webchat/service.ts', 'src/lib/reception/engine.ts']
  ok('vidensbase: firmafakta står ikke hårdkodet i svar-/motor-koden', srcFiles.every((f) => !/kontakt@eltasolar\.dk|eltasolar\.dk/.test(readFileSync(join(process.cwd(), f), 'utf8'))))

  // ── 6. Kontrakt/adapter, tråde, visninger, retention ────────────────────────────────────────────────────────
  const wc = webChatToInbound({ id: PORTAL, session_id: ID.hansen, direction: 'inbound', author: 'visitor', body: 'hej', created_at: now }, { id: ID.hansen, visitor_name: 'A', visitor_phone: '20304050', visitor_email: null, visitor_postal_code: null, topic: 'quote' })
  ok('web-chat-adapter: gyldig kontrakt, nøgle = DB-nøglen, aldrig bekræftet kunde', validateInbound(wc).length === 0 && wc.dedupeKey === `webchat:web_chat_messages:${PORTAL}` && wc.customer.state !== 'confirmed')
  ok('tråd: to forskellige mails giver forskellige nøgler (uafhængige henvendelser medmindre DB-tråden matcher)', dedupeKeyFor('mail', { table: 'incoming_emails', id: MAIL }, null) !== dedupeKeyFor('mail', { table: 'incoming_emails', id: PORTAL }, null))
  ok('visninger: gamle ?filter=phone-links → kanal-filter', JSON.stringify(parseHenvendelseQuery('phone', undefined)) === JSON.stringify({ view: 'all', channel: 'phone' }))
  ok('visninger: ukendt → Nye; kanal valideres', parseHenvendelseQuery('x', 'fax').view === 'new' && parseHenvendelseQuery('awaiting_elta', 'web_chat').channel === 'web_chat')
  ok('retention: politik klemmes til sikre grænser', JSON.stringify(clampPolicy({ handled_text_days: 1, customer_deleted_days: 9999 })) === JSON.stringify({ ...DEFAULT_RETENTION_POLICY, handled_text_days: 7, customer_deleted_days: 365 }))
  const rcalls: Array<{ p_apply: boolean }> = []
  const rpc = async (_fn: 'reception_retention', args: { p_policy: unknown; p_apply: boolean }) => { rcalls.push(args); return { data: { applied: args.p_apply }, error: null } }
  await runReceptionRetention(rpc, { apply: true, env: {} })
  ok('retention: apply uden RECEPTION_RETENTION_APPLY → dry-run', rcalls[0].p_apply === false)
  await runReceptionRetention(rpc, { apply: false, env: { RECEPTION_RETENTION_APPLY: 'true' } })
  await runReceptionRetention(rpc, { apply: true, env: { RECEPTION_RETENTION_APPLY: 'true' } })
  ok('retention: kun eksplicit apply + flag rydder', rcalls[1].p_apply === false && rcalls[2].p_apply === true)
  const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')
  ok('retention/receptionist: ingen cron i vercel.json', !/reception/i.test(vercel))

  // ── 7. Ingen ekstern afsendelse fra hub-koden ───────────────────────────────────────────────────────────────
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })
  const hubFiles = [...walk(join(process.cwd(), 'src', 'lib', 'reception')), join(process.cwd(), 'src', 'app', 'api', 'webchat', 'route.ts'), join(process.cwd(), 'src', 'app', 'webchat-test', 'webchat-test.tsx'), join(process.cwd(), 'src', 'app', 'api', 'cron', 'reception-retention', 'route.ts')]
  const sendRe = /sendEmail|sendEmailViaGraph|sendSms|sendSMS|relatel.*(call|sms)|twilio|nodemailer|resend\.|\/sendMail|graph\.microsoft\.com/i
  const offenders = hubFiles.filter((f) => sendRe.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')))
  ok('ingen afsendelses-kode (mail/SMS/opkald) i hub-modulerne', offenders.length === 0, offenders.join(', '))
  const svc = readFileSync(join(process.cwd(), 'src', 'lib', 'reception', 'webchat', 'service.ts'), 'utf8')
  ok('web-chat-servicen sender ikke den besøgendes tekst til AI-modellen', /Den besøgendes egen tekst sendes IKKE/.test(svc) && !/content:\s*text\b/.test(svc))
  const intake = readFileSync(join(process.cwd(), 'src', 'lib', 'reception', 'channel-intake.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  ok('kanal-adapteren får aldrig den rå admin-klient (kun backgroundCapability)', !/\.from\(|\.rpc\(/.test(intake) && /backgroundCapability\(createAdminClient\(\)\)/.test(intake))

  // Final review §8 — service_role-grænsen bevist statisk
  const srcAll = walk(join(process.cwd(), 'src')).filter((f) => /\.(ts|tsx)$/.test(f))
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const capDefs = srcAll.filter((f) => /\breadPort\s*:/.test(strip(readFileSync(f, 'utf8'))))
  ok('readPort defineres KUN i background-actor.ts (ingen anden kode kan bygge en "service_role-læseport")', capDefs.length === 1 && capDefs[0].replace(/\\/g, '/').endsWith('src/lib/reception/background-actor.ts'), capDefs.join(', '))
  const capCalls = srcAll.filter((f) => /\bbackgroundCapability\(/.test(strip(readFileSync(f, 'utf8'))) && !f.replace(/\\/g, '/').endsWith('background-actor.ts'))
  ok('backgroundCapability() kaldes kun med createAdminClient() (kanal-adapter og web-chat)', capCalls.every((f) => /backgroundCapability\((createAdminClient\(\)|admin)\)/.test(strip(readFileSync(f, 'utf8')))), capCalls.join(', '))
  const actor = strip(readFileSync(join(process.cwd(), 'src', 'lib', 'reception', 'background-actor.ts'), 'utf8'))
  ok('kapabiliteten har kun select / rpc reception_ingest / faste kilde-kolonner (ingen insert/update/delete/upsert/storage)', !/\.(insert|update|delete|upsert)\(|\.storage\b|\.auth\b/.test(actor) && (actor.match(/admin\.rpc\(/g) ?? []).length === 1 && /admin\.rpc\(BACKGROUND_RPC/.test(actor))
  ok('kapabiliteten: ingen vilkårlig tabel/kolonneliste (allowlists + hasOwnProperty)', /BACKGROUND_READ_TABLES as readonly string\[\]\)\.includes\(table\)/.test(actor) && /hasOwnProperty\.call\(allow, table\)/.test(actor))
  const scanner = readFileSync(join(process.cwd(), 'scripts', 'rls-write-sites.ts'), 'utf8')
  ok('RLS-matrix: readPort genkendes KUN via typecheckeren som BackgroundCapability.readPort (ikke på navnet alene)', /d\.parent\.name\.text === 'BackgroundCapability'/.test(scanner) && /endsWith\('src\/lib\/reception\/background-actor\.ts'\)/.test(scanner))
  const store = strip(readFileSync(join(process.cwd(), 'src', 'lib', 'reception', 'webchat', 'store.ts'), 'utf8'))
  const storeTables = [...new Set([...store.matchAll(/admin\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))].sort()
  const storeRpcs = [...new Set([...store.matchAll(/admin\.rpc\('([a-z_]+)'/g)].map((m) => m[1]))]
  ok('web-chat-lageret rører KUN de to chat-tabeller + rpc web_chat_rate_check', JSON.stringify(storeTables) === JSON.stringify(['web_chat_messages', 'web_chat_sessions']) && JSON.stringify(storeRpcs) === JSON.stringify(['web_chat_rate_check']), `${storeTables} ${storeRpcs}`)

  console.log(`\n${fail ? '❌' : '✅'} ${pass} bestået, ${fail} fejlet`)
  process.exitCode = fail ? 1 : 0
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
