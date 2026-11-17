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
import { ingestEmailSource, ingestPortalMessageSource, EMAIL_INGEST_MAX_AGE_HOURS } from '../src/lib/reception/channel-intake'
import { attachmentRefs, webChatToInbound } from '../src/lib/reception/adapters'
import { dedupeKeyFor, validateInbound } from '../src/lib/reception/contract'
import { emailIngestEnabled, portalIngestEnabled, webChatEnabled, webChatAiReplyEnabled, intakeGateEnabled, EXTERNAL_SENDS_ENABLED } from '../src/lib/reception/flags'
import { RECEPTION_KNOWLEDGE, missingKnowledge, knowledgeQuestion, knowledgeAnswer, isKnown } from '../src/lib/reception/knowledge'
import { composeWebChatReply, aiReplyViolations } from '../src/lib/reception/webchat/reply'
import { postWebChatMessage, startWebChat } from '../src/lib/reception/webchat/service'
import { cleanVisitor, type WebChatStore, type WebChatSession, type WebChatMessage } from '../src/lib/reception/webchat/store'
import { emergencyReply } from '../src/lib/reception/emergency-policy'
import { clampPolicy, runReceptionRetention, DEFAULT_RETENTION_POLICY } from '../src/lib/reception/retention'
import { parseHenvendelseQuery } from '../src/lib/reception/henvendelser-views'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && note ? ` — ${note}` : ''}`) }
const ON = { RECEPTION_EMAIL_INGEST_ENABLED: 'true', RECEPTION_PORTAL_INGEST_ENABLED: 'true', RECEPTION_WEBCHAT_ENABLED: 'true' }

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

function fakeCap(src: Record<string, SourceRead>, outcome: Record<string, unknown> = { outcome: 'created', conversation_id: ID.hansen, item_id: ID.jensen, actions: [] }, readFail = false) {
  const payloads: Array<Record<string, unknown>> = []
  const reads: string[] = []
  const cap: BackgroundCapability = {
    readPort: fakeReadPort({ fail: readFail }),
    ingest: async (p) => { payloads.push(p); const o = outcome; return o.outcome === 'duplicate' ? { outcome: 'duplicate', conversationId: null } : { outcome: o.outcome as 'created' | 'appended', conversationId: String(o.conversation_id), itemId: String(o.item_id), actions: [] } },
    readSource: async (t, id) => { reads.push(`${t}:${id}`); return src[`${t}:${id}`] ?? { ok: false, error: 'not_found' } },
  }
  return { cap, payloads, reads }
}

const MAIL = '00000000-0000-4000-8000-00000000e001'
const PORTAL = '00000000-0000-4000-8000-00000000f001'
const now = new Date().toISOString()
const mailRow = (over: Record<string, unknown> = {}) => ({ ok: true as const, row: { id: MAIL, subject: 'Batteri går offline', sender_email: 'hansen@example.dk', sender_name: 'Hans', body_preview: 'Mit batteri går offline igen.', body_text: null, body_html: null, received_at: now, customer_id: null, customer_contact_id: null, linked_by: null, link_status: 'pending', has_attachments: false, attachment_urls: [], service_case_id: null, ...over } })

function fakeStore() {
  const sessions = new Map<string, WebChatSession & { token: string }>()
  const msgs: WebChatMessage[] = []
  let n = 0
  const store: WebChatStore = {
    async createSession(visitor, topic) {
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, token = `t${String(n).padStart(42, 'x')}`
      const s = { id, token, ...(cleanVisitor(visitor) as Record<string, string | null>), topic, message_count: 0, closed_at: null } as unknown as WebChatSession & { token: string }
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
  return { store, msgs }
}

async function chat(text: string, visitor: Record<string, string> = {}, topic = 'general', extra: { rephrase?: (b: string, f: Record<string, string>) => Promise<string | null>; env?: Record<string, string> } = {}) {
  const { store, msgs } = fakeStore()
  const { cap, payloads } = fakeCap({})
  const env = { ...ON, ...(extra.env ?? {}) }
  const s = await startWebChat({ visitor, topic }, { env, store, capability: cap })
  if (!s.ok) throw new Error('start')
  const r = await postWebChatMessage({ token: s.token, text, clientMessageId: 'msgid00001' }, { env, store, capability: cap, rephrase: extra.rephrase })
  return { r, payloads, msgs, store, token: s.token, cap, env }
}

async function main() {
  // ── 1. Flag pr. aktiveringstrin (ingen hovedafbryder) ─────────────────────────────────────────────────────────
  ok('flag: alle FRA som standard', !emailIngestEnabled({}) && !portalIngestEnabled({}) && !webChatEnabled({}) && !webChatAiReplyEnabled({}))
  ok('flag: mail tændt tænder IKKE portal/chat/baggrund', intakeGateEnabled('email', { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }) && !intakeGateEnabled('portal', { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }) && !intakeGateEnabled('webchat', { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }) && !intakeGateEnabled('background', { RECEPTION_EMAIL_INGEST_ENABLED: 'true' }))
  ok('flag: RECEPTION_BACKGROUND_ENABLED tænder ikke mail/portal/chat', !intakeGateEnabled('email', { RECEPTION_BACKGROUND_ENABLED: 'true' }) && !intakeGateEnabled('portal', { RECEPTION_BACKGROUND_ENABLED: 'true' }) && !intakeGateEnabled('webchat', { RECEPTION_BACKGROUND_ENABLED: 'true' }))
  ok('flag: AI-svar kræver også web-chat-flaget', !webChatAiReplyEnabled({ RECEPTION_WEBCHAT_AI_REPLY_ENABLED: 'true' }) && webChatAiReplyEnabled({ RECEPTION_WEBCHAT_ENABLED: 'true', RECEPTION_WEBCHAT_AI_REPLY_ENABLED: 'true' }))
  ok('ekstern afsendelse: konstant false', EXTERNAL_SENDS_ENABLED === false)

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
  const old = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ received_at: new Date(Date.now() - (EMAIL_INGEST_MAX_AGE_HOURS + 1) * 3_600_000).toISOString() }) })
  ok('mail ældre end grænsen → skipped not_new (ingen stille historik-import)', (await ingestEmailSource(MAIL, { env: ON, capability: old.cap })).reason === 'not_new' && old.payloads.length === 0)
  const ign = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ link_status: 'ignored' }) })
  ok('mail ignoreret (spam/nyhedsbrev) → skipped', (await ingestEmailSource(MAIL, { env: ON, capability: ign.cap })).reason === 'ignored' && ign.payloads.length === 0)
  const emer = fakeCap({ [`incoming_emails:${MAIL}`]: mailRow({ subject: 'Det brænder i tavlen', body_preview: 'Der kommer røg ud af eltavlen' }) })
  await ingestEmailSource(MAIL, { env: ON, capability: emer.cap })
  ok('mail nød → emergency + handoff (kun forslag; intet udført)', emer.payloads[0].urgency === 'emergency' && emer.payloads[0].status === 'handoff' && (emer.payloads[0].actions as Array<{ execute: boolean }>).every((a) => !a.execute))
  const thr = await ingestEmailSource(MAIL, { env: ON, capability: fakeCap({ [`incoming_emails:${MAIL}`]: mailRow() }, { outcome: 'appended', conversation_id: ID.hansen, item_id: ID.jensen }).cap })
  ok('mail i åben tråd → appended (databasen afgør tråden)', thr.outcome === 'appended')
  const boom: BackgroundCapability = { readPort: fakeReadPort(), ingest: async () => { throw new Error('x') }, readSource: async () => mailRow() }
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
  const again = await postWebChatMessage({ token: c0.token, text: 'Hej, jeg har et spørgsmål', clientMessageId: 'msgid00001' }, { env: ON, store: c0.store, capability: c0.cap })
  ok('web-chat gentaget besked (samme klient-id) → duplicate, intet nyt indtag/svar', again.ok && again.duplicate && c0.payloads.length === 2)
  const tooLong = await postWebChatMessage({ token: c0.token, text: 'x'.repeat(1001) }, { env: ON, store: c0.store, capability: c0.cap })
  ok('web-chat: for lang besked afvises', !tooLong.ok && tooLong.error === 'invalid')
  ok('web-chat: ukendt session afvises', (await postWebChatMessage({ token: 'y'.repeat(43), text: 'hej' }, { env: ON, store: c0.store, capability: c0.cap })).ok === false)
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

  console.log(`\n${fail ? '❌' : '✅'} ${pass} bestået, ${fail} fejlet`)
  process.exitCode = fail ? 1 : 0
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
