/**
 * AI-receptionist fase 2 — regressionstest (ren; ingen DB, intet netværk, ingen afsendelse).
 *   npx tsx scripts/reception-test.ts
 * Dækker: kanonisk telefon, identitets-matcher, oplysningsniveauer, handlings-politik, engine-scenarier, LLM-værn,
 * AI-klient-fejltyper, AI-aktør, adaptere/kontrakt, upload-link-tjek, idempotent indtag/forslag (falsk DB) og at
 * receptionist-koden ikke kan sende eksternt.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { canonicalPhone, samePhone, localPhoneDigits } from '../src/lib/utils/phone'
import { toRelatelNumber } from '../src/lib/integrations/relatel/phone'
import { phoneDigits } from '../src/lib/customers/csv-import'
import { classifyIdentity, matchIdentity } from '../src/lib/reception/identity-match'
import { canDisclose, disclosureLevel, verifyFacts } from '../src/lib/reception/disclosure'
import { evaluateAction, replyViolations, FORBIDDEN_COMMITMENTS } from '../src/lib/reception/action-policy'
import { runReceptionTurn, mergeClassification } from '../src/lib/reception/engine'
import { detectSignals, classifyIntent } from '../src/lib/reception/signals'
import { aiChat, aiStructured, type AiProvider } from '../src/lib/ai/ai-client'
import { validateLlmClassification } from '../src/lib/reception/llm-classify'
import { aiActorMayExecute, ACTION_PERMISSIONS } from '../src/lib/reception/ai-actor'
import { emailToInbound, portalToInbound, callToInbound, smsToInbound } from '../src/lib/reception/adapters'
import { validateInbound, dedupeKeyFor } from '../src/lib/reception/contract'
import { contentMatchesType, checkUploadRequest, acceptUploadFiles, hashUploadToken, isWellFormedUploadToken, newUploadToken } from '../src/lib/reception/upload-links'
import { EXTERNAL_SENDS_ENABLED, uploadLinksEnabled, receptionLlmEnabled } from '../src/lib/reception/flags'
import { ingestCommunication, recordAndExecuteActions } from '../src/lib/reception/henvendelser-core'
import { ROWS, ID, fakePorts, SCENARIOS } from './reception-fixtures'
import type { Permission } from '../src/lib/auth/permissions'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && note ? ` — ${note}` : ''}`) }
const turn = (text: string | null, phone?: string, extra: Partial<Parameters<typeof runReceptionTurn>[0]> = {}, ports = fakePorts()) =>
  runReceptionTurn({ channel: 'phone', text, sender: { phone: phone ?? null }, conversationKey: `t:${text}:${phone}`, ...extra }, ports)

async function main() {
  // ── 1. Kanonisk telefon (samlet) ────────────────────────────────────────────────────────────────────────────────
  ok('canonicalPhone: 8 cifre → 45-præfiks', canonicalPhone('20 30 40 50') === '4520304050')
  ok('canonicalPhone: +45 og 0045 giver samme nøgle', canonicalPhone('+45 20304050') === canonicalPhone('0045 20 30 40 50'))
  ok('canonicalPhone: for kort → null', canonicalPhone('1234') === null)
  ok('Relatel-format = kanonisk (én implementering)', toRelatelNumber === canonicalPhone)
  ok('samePhone: formater ligegyldige', samePhone('+4520304050', '20-30-40-50'))
  ok('samePhone: ubrugeligt nummer matcher aldrig', !samePhone('', ''))
  ok('CSV phoneDigits = localPhoneDigits (uændret adfærd)', phoneDigits('+45 20 30 40 50') === '20304050' && phoneDigits('20304050') === '20304050' && phoneDigits(null) === '')
  ok('localPhoneDigits: 0045 fjernes', localPhoneDigits('0045 20304050') === '20304050')

  // ── 2. Identitets-matcher ───────────────────────────────────────────────────────────────────────────────────────
  ok('kendt opkalder → unique_match', classifyIdentity({ phone: '20304050' }, ROWS).state === 'unique_match')
  ok('kontaktens mobil → kundens kandidat', classifyIdentity({ phone: '40404040' }, ROWS).candidates[0]?.customerId === ID.hansen)
  ok('ukendt opkalder → no_match', classifyIdentity({ phone: '61616161' }, ROWS).state === 'no_match')
  const lead = classifyIdentity({ phone: '50505050' }, ROWS)
  ok('lead-nummer → no_match + lead-kandidat (aldrig konverteret)', lead.state === 'no_match' && lead.leadIds.length === 1)
  ok('delt nummer → ambiguous (2 kandidater)', classifyIdentity({ phone: '30303030' }, ROWS).state === 'ambiguous' && classifyIdentity({ phone: '30303030' }, ROWS).candidates.length === 2)
  ok('ingen nøgle → insufficient_information', classifyIdentity({}, ROWS).state === 'insufficient_information')
  ok('kun navn (ingen nøgle) → insufficient_information (ingen navne-match)', classifyIdentity({ phone: 'Hansen' } as never, ROWS).state === 'insufficient_information')
  ok('e-mail case-insensitive → unique', classifyIdentity({ email: 'HANSEN@example.dk' }, ROWS).state === 'unique_match')
  ok('pladsholder-mail ignoreres', classifyIdentity({ email: 'auto+1003@elta-crm.local' }, ROWS).state === 'insufficient_information')
  ok('kundenummer → unique', classifyIdentity({ customerNumber: 'k-1002' }, ROWS).candidates[0]?.customerId === ID.jensen)
  ok('kendt kontakt-id → kundens kandidat', classifyIdentity({ contactId: ID.hansenContact }, ROWS).candidates[0]?.customerId === ID.hansen)
  ok('telefon + kundenummer på forskellige kunder → ambiguous (ingen stille valg)', classifyIdentity({ phone: '20304050', customerNumber: 'K-1002' }, ROWS).state === 'ambiguous')
  const failing = { from: () => { const b: Record<string, unknown> = {}; for (const m of ['select', 'or', 'order', 'not', 'ilike', 'eq']) b[m] = () => b; b.range = async () => ({ data: null, error: { message: 'boom' } }); b.limit = async () => ({ data: null, error: { message: 'boom' } }); return b } }
  const re = await matchIdentity(failing, { phone: '20304050' })
  ok('læsefejl → read_error (ALDRIG no_match)', re.state === 'read_error' && re.error === 'read:customers', JSON.stringify(re))
  const re2 = await matchIdentity(failing, { email: 'x@example.dk' })
  ok('læsefejl på e-mail-opslag → read_error', re2.state === 'read_error')

  // ── 3. Oplysningsniveauer (deterministisk) ──────────────────────────────────────────────────────────────────────
  const uniq = { state: 'unique_match' as const }
  ok('L0: ukendt', disclosureLevel({ identity: { state: 'no_match' }, channel: 'phone', verification: 'not_attempted', strongVerification: false, failedAttempts: 0 }) === 0)
  ok('L0: tvetydig', disclosureLevel({ identity: { state: 'ambiguous' }, channel: 'phone', verification: 'verified', strongVerification: false, failedAttempts: 0 }) === 0)
  ok('L1: kun opkalds-nummer (forfalskbart) — ingen sagsoplysninger', disclosureLevel({ identity: uniq, channel: 'phone', verification: 'not_attempted', strongVerification: false, failedAttempts: 0 }) === 1 && !canDisclose(1, 'case_status') && canDisclose(1, 'relationship_exists'))
  ok('L2: bekræftet postnr.+vej → sagsstatus', disclosureLevel({ identity: uniq, channel: 'phone', verification: 'verified', strongVerification: false, failedAttempts: 0 }) === 2 && canDisclose(2, 'case_status') && !canDisclose(2, 'invoice_amounts'))
  ok('L3: kun stærk verifikation (portal)', disclosureLevel({ identity: uniq, channel: 'portal', verification: 'not_attempted', strongVerification: true, failedAttempts: 0 }) === 3)
  ok('2 mislykkede bekræftelser → L0', disclosureLevel({ identity: uniq, channel: 'phone', verification: 'verified', strongVerification: false, failedAttempts: 2 }) === 0)
  const facts = { postalCodes: ['8000'], streetNames: ['solvej'], caseNumbers: ['SVC-01824'] }
  ok('bekræftelse: postnr.+vejnavn (med husnr.) → verified', verifyFacts(facts, { postalCode: '8000', streetName: 'Solvej 4' }) === 'verified')
  ok('bekræftelse: sagsnummer → verified', verifyFacts(facts, { caseNumber: 'svc 01824' }) === 'verified')
  ok('bekræftelse: forkert postnr. → failed', verifyFacts(facts, { postalCode: '9000', streetName: 'Solvej' }) === 'failed')
  ok('bekræftelse: kun postnr. → not_attempted (ikke nok)', verifyFacts(facts, { postalCode: '8000' }) === 'not_attempted')

  // ── 4. Handlings-politik ────────────────────────────────────────────────────────────────────────────────────────
  const sig0 = detectSignals('')
  const base = { identity: 'unique_match' as const, caseState: 'exact' as const, level: 1 as const, confidence: 0.9, urgency: 'normal' as const, signals: sig0 }
  for (const f of FORBIDDEN_COMMITMENTS) ok(`forbudt for AI: ${f}`, evaluateAction(f, base).outcome === 'forbidden')
  ok('ukendt handling → forbidden', evaluateAction('send_sms', base).outcome === 'forbidden')
  ok('opgave ved unik kandidat → auto', evaluateAction('create_task', base).outcome === 'auto')
  ok('ny sag → altid forslag', evaluateAction('create_case_proposal', base).outcome === 'proposal')
  ok('ny kunde ved unikt match → forbidden (dublet)', evaluateAction('create_customer_proposal', base).outcome === 'forbidden')
  ok('ny kunde ved no_match → forslag', evaluateAction('create_customer_proposal', { ...base, identity: 'no_match' }).outcome === 'proposal')
  ok('ny kunde ved read_error → handoff (kan ikke udelukke dublet)', evaluateAction('create_customer_proposal', { ...base, identity: 'read_error' }).outcome === 'handoff')
  ok('flere åbne sager → opgave er forslag', evaluateAction('create_task', { ...base, caseState: 'several_open' }).outcome === 'proposal')
  ok('lav confidence → handoff', evaluateAction('create_task', { ...base, confidence: 0.5 }).outcome === 'handoff')
  ok('tvetydig identitet → handoff', evaluateAction('create_callback', { ...base, identity: 'ambiguous' }).outcome === 'handoff')
  ok('klage → handoff', evaluateAction('create_task', { ...base, signals: detectSignals('jeg vil klage') }).outcome === 'handoff')
  ok('mark_handled → altid forslag', evaluateAction('mark_handled', base).outcome === 'proposal')
  ok('append_communication → auto selv under handoff', evaluateAction('append_communication', { ...base, signals: detectSignals('gnister') }).outcome === 'auto')

  // ── 5. Engine-scenarier (simulator-fixtures) ────────────────────────────────────────────────────────────────────
  const t1 = await turn('Mit batteri går offline.', '20304050')
  ok('batteri offline: kendt kunde, service_fault, eksakt sag, opgave auto, foto forslag', t1.identity.state === 'unique_match' && t1.intent === 'service_fault' && t1.caseMatch.state === 'exact'
    && t1.actions.find((a) => a.type === 'create_task')?.outcome === 'auto' && t1.actions.find((a) => a.type === 'request_documents')?.outcome === 'proposal' && !t1.handoff, JSON.stringify(t1.actions))
  const t2 = await turn('Jeg vil gerne have et tilbud på solceller.', '61616161')
  ok('tilbud: ukendt → kundeforslag + pris afvist som tilsagn + ingen beløb i svar', t2.identity.state === 'no_match' && t2.intent === 'new_installation_inquiry'
    && t2.actions.find((a) => a.type === 'create_customer_proposal')?.outcome === 'proposal' && t2.commitmentsRefused.includes('quote_binding_price') && replyViolations(t2.reply).length === 0)
  ok('tilbud: opgave uden entydig kunde → forslag (aldrig auto-kobling)', t2.actions.find((a) => a.type === 'create_task')?.outcome === 'proposal')
  const t3 = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '20304050')
  ok('forfalsket/ubekræftet nummer: L1 → beder om bekræftelse, INGEN sagsoplysning i svar', t3.level === 1 && t3.needsVerification && !/SVC-01824|Batteri/.test(t3.reply), t3.reply)
  ok('dato-spørgsmål → promise_date afvist, planlægnings-anmodning', t3.commitmentsRefused.includes('promise_date') && t3.actions.some((a) => a.type === 'create_planning_request'))
  const t4 = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '20304050', { claimed: { postalCode: '8000', streetName: 'Solvej 4' } })
  ok('bekræftet (L2) → ikke-følsom sagsstatus, stadig ingen dato-løfte', t4.level === 2 && /SVC-01824/.test(t4.reply) && /kan ikke love et tidspunkt/.test(t4.reply) && replyViolations(t4.reply).length === 0, t4.reply)
  const t4b = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '20304050', { claimed: { postalCode: '9999', streetName: 'Forkertvej' } })
  ok('bekræftelse fejlet (1. gang) → L1, ingen sagsdata', t4b.verification === 'failed' && t4b.level === 1 && !/SVC/.test(t4b.reply))
  const t4c = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '20304050', { claimed: { postalCode: '9999', streetName: 'Forkertvej' }, failedVerificationAttempts: 1 })
  ok('bekræftelse fejlet 2. gang → L0 + handoff verification_failed', t4c.level === 0 && !!t4c.handoff?.reasons.includes('verification_failed'))
  const t5 = await turn('Jeg har ingen strøm i huset.', '22222222')
  ok('ingen strøm: høj, handoff urgent_outage → service, ingen åben sag', t5.urgency === 'high' && !!t5.handoff?.reasons.includes('urgent_outage') && t5.handoff?.team === 'service' && t5.caseMatch.state === 'no_open_case')
  const t6 = await turn('Jeg vil klage over fakturaen.', '21212121')
  ok('fakturaklage: handoff dispute → bogholderi, høj', t6.intent === 'invoice_question' && !!t6.handoff?.reasons.includes('customer_dispute') && t6.handoff?.team === 'bogholderi' && t6.urgency === 'high')
  const t7 = await turn('Det slår gnister fra eltavlen og lugter brændt!', '20304050')
  ok('nød: emergency, sikkerhedstekst (112), dispatch afvist, ingen udsendelse', t7.urgency === 'emergency' && /112/.test(t7.reply) && t7.commitmentsRefused.includes('dispatch_emergency') && !t7.actions.some((a) => a.type === 'dispatch_emergency' && a.outcome !== 'forbidden') && !!t7.handoff?.reasons.includes('safety_emergency'))
  const t8 = await turn('Mit batteri går offline.', '30303030')
  ok('tvetydig opkalder: handoff, ingen kandidatdata, ingen kundeforslag', t8.identity.state === 'ambiguous' && !!t8.handoff?.reasons.includes('ambiguous_identity') && t8.level === 0 && !t8.actions.some((a) => a.payload.customerCandidateId))
  const t9 = await turn('Jeg vil gerne tale med en medarbejder.', '20304050')
  ok('menneske ønsket → handoff human_requested', !!t9.handoff?.reasons.includes('human_requested'))
  const t10 = await turn(null, '20304050')
  ok('transskription mangler → handoff, aldrig tom succes', !!t10.handoff?.reasons.includes('transcript_unavailable') && /kunne ikke leveres/.test(t10.summary))
  const t11 = await turn('Hej, det drejer sig om det der fra sidst.', '20304050')
  ok('lav confidence → handoff low_confidence', !!t11.handoff?.reasons.includes('low_confidence') && t11.confidence < 0.7)
  const t12 = await turn('Mit anlæg virker ikke.', '21212121')
  ok('flere åbne sager → several_open; sagsforslag (aldrig valgt i stilhed)', t12.caseMatch.state === 'several_open' && t12.caseMatch.candidateId === null && t12.actions.find((a) => a.type === 'create_case_proposal')?.outcome === 'proposal')
  const t13 = await turn('Mit batteri går offline.', '20304050', { claimed: { caseNumber: 'SVC-01824' } })
  ok('eksakt sag via oplyst sagsnummer', t13.caseMatch.state === 'exact' && t13.caseMatch.candidateId === ID.case1824)
  const t14 = await turn('Mit batteri går offline.', '20304050', {}, fakePorts({ failIdentity: true }))
  ok('identitets-læsefejl → handoff identity_read_error (ikke "ny kunde")', t14.identity.state === 'read_error' && !!t14.handoff?.reasons.includes('identity_read_error') && !t14.actions.some((a) => a.type === 'create_customer_proposal' && a.outcome === 'proposal'))
  const t15 = await turn('Mit batteri går offline.', '20304050', {}, fakePorts({ failCases: true }))
  ok('sags-læsefejl → read_error, ikke "ingen sag"', t15.caseMatch.state === 'read_error')
  const t16 = await turn('Jeg vil have en pris på at flytte min stikkontakt, er det lovligt jeg selv gør det?', '20304050')
  ok('pris + compliance → afvist som tilsagn + handoff compliance', t16.commitmentsRefused.includes('quote_binding_price') && t16.commitmentsRefused.includes('compliance_answer') && !!t16.handoff?.reasons.includes('compliance'))
  const t17 = await turn('Jeg er meget utilfreds, det er tredje gang I ikke kommer.', '20304050')
  ok('utilfreds kunde → handoff unhappy_customer, høj', !!t17.handoff?.reasons.includes('unhappy_customer') && t17.urgency === 'high')
  for (const t of [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t16, t17]) if (replyViolations(t.reply).length) ok(`svar uden løfter: ${t.title}`, false, t.reply)
  ok('ingen scenarie-svar indeholder beløb/løfte-datoer/garanti', [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t16, t17].every((t) => replyViolations(t.reply).length === 0))
  ok('idempotensnøgle stabil pr. samtale+handling', (await turn('Mit batteri går offline.', '20304050')).actions.map((a) => a.idempotencyKey).join() === t1.actions.map((a) => a.idempotencyKey).join())

  // ── 6. LLM kan ikke omgå politikken ─────────────────────────────────────────────────────────────────────────────
  const llmEvil = fakePorts({ classify: () => ({ ok: true, value: { intent: 'general_question', confidence: 0.99, proposedActions: ['alter_invoice', 'dispatch_emergency', 'send_sms', 'create_task'] } }) })
  const tl = await turn('Det slår gnister fra eltavlen!', '20304050', {}, llmEvil)
  ok('LLM kan ikke nedgradere nød (classify springes over ved nød)', tl.intent === 'emergency_safety' && tl.urgency === 'emergency')
  const tl2 = await turn('Fakturaen er forkert, kreditér den.', '20304050', {}, llmEvil)
  ok('LLM-forslag alter_invoice/send_sms → forbidden', tl2.actions.filter((a) => a.proposedBy === 'llm' && ['alter_invoice', 'dispatch_emergency', 'send_sms'].includes(a.type)).every((a) => a.outcome === 'forbidden'))
  ok('LLM kan ikke fjerne fakturaændrings-signal (handoff består)', !!tl2.handoff?.reasons.includes('invoice_change'))
  const tl3 = await turn('Mit batteri går offline.', '20304050', {}, fakePorts({ classify: () => ({ ok: false, error: 'timeout' }) }))
  ok('LLM-fejl → nøgleordsresultat + note (ikke tom succes)', tl3.intent === 'service_fault' && tl3.llmError === 'timeout' && tl3.notes.some((n) => /utilgængelig/.test(n)))
  ok('LLM-uenighed med stærk nøgleordsintent → lav confidence', mergeClassification(classifyIntent('Mit batteri går offline.'), { intent: 'offer_question', confidence: 0.95 }).confidence <= 0.6)
  ok('LLM-svar valideres (ukendt intent afvist)', validateLlmClassification({ intent: 'hack', confidence: 1 }) === null && validateLlmClassification({ intent: 'other', confidence: 0.4, proposed_actions: ['x', 3] })?.proposedActions?.length === 1)

  // ── 7. Fælles AI-klient ─────────────────────────────────────────────────────────────────────────────────────────
  const prov = (r: Awaited<ReturnType<AiProvider['chat']>> | 'throw' | 'hang'): AiProvider => ({ name: 'fake', configured: () => true, chat: async (req) => {
    if (r === 'throw') throw new Error('net')
    if (r === 'hang') return new Promise((_, rej) => req.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))
    return r
  } })
  const deps = { canSpend: async () => true, record: async () => {} }
  ok('AI: ikke konfigureret → not_configured', (await aiChat('mail_assistant', [], { ...deps, provider: { name: 'x', configured: () => false, chat: async () => ({ ok: true, text: 'x' }) } })).ok === false)
  const http = await aiChat('mail_assistant', [], { ...deps, provider: prov({ ok: false, status: 503 }) })
  ok('AI: HTTP 503 → provider_http, retryable (ikke tomt resultat)', !http.ok && http.error.code === 'provider_http' && http.error.retryable)
  const empty = await aiChat('mail_assistant', [], { ...deps, provider: prov({ ok: true, text: '  ' }) })
  ok('AI: tomt svar → empty_response (fejl, ikke succes)', !empty.ok && empty.error.code === 'empty_response')
  const net = await aiChat('mail_assistant', [], { ...deps, provider: prov('throw') })
  ok('AI: netværksfejl → provider_network', !net.ok && net.error.code === 'provider_network')
  const budget = await aiChat('mail_assistant', [], { canSpend: async () => false, provider: prov({ ok: true, text: 'x' }) })
  ok('AI: budget opbrugt → budget_exhausted', !budget.ok && budget.error.code === 'budget_exhausted')
  const budgetErr = await aiChat('mail_assistant', [], { canSpend: async () => { throw new Error('db') }, provider: prov({ ok: true, text: 'x' }) })
  ok('AI: budget kan ikke læses → budget_unavailable (fail-closed)', !budgetErr.ok && budgetErr.error.code === 'budget_unavailable')
  const bad = await aiStructured('reception_classify', [], validateLlmClassification, { ...deps, provider: prov({ ok: true, text: '{"intent":"x"' }) })
  ok('AI: ugyldig JSON → invalid_json', !bad.ok && bad.error.code === 'invalid_json')
  const sch = await aiStructured('reception_classify', [], validateLlmClassification, { ...deps, provider: prov({ ok: true, text: '{"intent":"hack","confidence":1}' }) })
  ok('AI: skemafejl → schema_invalid', !sch.ok && sch.error.code === 'schema_invalid')
  const good = await aiStructured('reception_classify', [], validateLlmClassification, { ...deps, provider: prov({ ok: true, text: '{"intent":"service_fault","confidence":0.8}' }) })
  ok('AI: gyldigt struktureret svar', good.ok && good.data.intent === 'service_fault' && good.model === 'gpt-4o-mini')
  const aiSrc = readFileSync(join(process.cwd(), 'src', 'lib', 'ai', 'ai-client.ts'), 'utf8')
  ok('AI-klient: ingen use server/use client (nøglen forbliver på serveren)', !/^\s*['"]use (server|client)['"]/m.test(aiSrc))
  ok('mail-assistenten bruger den fælles klient (ingen rå fetch/OPENAI-nøgle)', (() => { const s = readFileSync(join(process.cwd(), 'src', 'lib', 'actions', 'ai-mail-assistant.ts'), 'utf8'); return /aiChat\(/.test(s) && !/api\.openai\.com/.test(s) && !/OPENAI_API_KEY\b(?!.*mangler)/.test(s.replace(/'AI er ikke konfigureret \(OPENAI_API_KEY mangler\)'/, '')) })())

  // ── 8. AI-aktøren ──────────────────────────────────────────────────────────────────────────────────────────────
  const all = (_p: Permission) => true
  ok('aktør: opgave tilladt med medarbejderens tasks.create', aiActorMayExecute('create_task', all, ACTION_PERMISSIONS.create_task).allowed)
  const revoked = aiActorMayExecute('create_task', (p) => p !== 'tasks.create', ACTION_PERMISSIONS.create_task)
  ok('aktør: tilbagekaldt rettighed hos medarbejderen → afvist', !revoked.allowed && revoked.reason === 'missing_user_permission')
  const outside = aiActorMayExecute('create_task', all, ['invoices.view' as Permission])
  ok('aktør: rettighed uden for allowlist → afvist selv for admin', !outside.allowed && outside.reason === 'not_in_allowlist')
  ok('aktør: kunde-/sagsforslag kun forslag', (aiActorMayExecute('create_case_proposal', all, []) as { reason?: string }).reason === 'propose_only')
  ok('aktør: ukendt handling → not_in_allowlist', (aiActorMayExecute('alter_invoice', all, []) as { reason?: string }).reason === 'not_in_allowlist')

  // ── 9. Adaptere + kontrakt ─────────────────────────────────────────────────────────────────────────────────────
  const mail = emailToInbound({ id: ID.case1824, subject: 'Hej', sender_email: 'hansen@example.dk', sender_name: 'Hansen', body_preview: 'x', received_at: '2026-11-16T08:00:00Z', customer_id: ID.hansen, customer_contact_id: null, linked_by: 'manual', link_status: 'linked', has_attachments: false })!
  ok('mail manuelt koblet → confirmed + gyldig kontrakt', mail.customer.state === 'confirmed' && validateInbound(mail).length === 0, JSON.stringify(validateInbound(mail)))
  const auto = emailToInbound({ id: ID.case1900, subject: 'Hej', sender_email: 'x@example.dk', sender_name: null, body_preview: null, received_at: '2026-11-16T08:00:00Z', customer_id: ID.hansen, customer_contact_id: null, linked_by: 'auto', link_status: 'linked', has_attachments: false })!
  ok('mail auto-koblet → kun kandidat', auto.customer.state === 'unique_match' && auto.customer.customerId === null && auto.customer.candidateId === ID.hansen)
  const web = emailToInbound({ id: ID.case1901, subject: 'Ny henvendelse fra hjemmesiden', sender_email: 'submissions@formsubmit.co', sender_name: 'FormSubmit', body_preview: 'x', received_at: '2026-11-16T08:00:00Z', customer_id: null, customer_contact_id: null, linked_by: null, link_status: 'unidentified', has_attachments: false, form_fields: { name: 'Test', phone: '20304050', email: 'kunde@example.dk', message: 'Batteri offline' } })!
  ok('webhenvendelse: FormSubmit er ALDRIG kunden — formularens felter bruges', web.channel === 'web_chat' && web.sender.email === 'kunde@example.dk' && web.sender.phone === '20304050' && web.message === 'Batteri offline')
  ok('ignoreret mail → ingen henvendelse', emailToInbound({ id: ID.hansen, subject: '', sender_email: '', sender_name: null, body_preview: null, received_at: '2026-11-16T08:00:00Z', customer_id: null, customer_contact_id: null, linked_by: null, link_status: 'ignored', has_attachments: false }) === null)
  const portal = portalToInbound({ id: ID.jensen, customer_id: ID.jensen, sender_type: 'customer', sender_name: 'Jensen', message: 'Har uploadet billeder', attachments: [{}], created_at: '2026-11-16T08:00:00Z' })!
  ok('portalbesked fra kunde → confirmed, gyldig', portal.customer.state === 'confirmed' && validateInbound(portal).length === 0)
  ok('portalbesked fra medarbejder → ingen henvendelse', portalToInbound({ id: ID.jensen, customer_id: ID.jensen, sender_type: 'employee', sender_name: null, message: 'x', attachments: [], created_at: '2026-11-16T08:00:00Z' }) === null)
  const call = callToInbound({ id: ID.nielsen, provider: 'relatel', provider_call_id: 'c-1', direction: 'inbound', started_at: '2026-11-16T08:00:00Z', external_number_normalized: '4520304050', customer_id: null, suggested_customer_id: ID.hansen, candidate_count: 1, missed: true, has_voicemail: false, service_case_id: null })!
  ok('opkald (00247-model): forslag → kandidat, ubesvaret → høj + tilbageringning, transskription unavailable', call.customer.state === 'unique_match' && call.urgency === 'high' && call.transcript.state === 'unavailable' && validateInbound(call).length === 0)
  ok('opkald uden tidspunkt → ingen henvendelse (bliver ikke til "nu")', callToInbound({ ...({} as never), id: ID.nielsen, provider: 'relatel', provider_call_id: 'c', direction: null, started_at: null, external_number_normalized: null, customer_id: null, suggested_customer_id: null, candidate_count: 0, missed: null, has_voicemail: null, service_case_id: null }) === null)
  ok('udgående SMS → ingen henvendelse (fundament)', smsToInbound({ id: ID.hansen, customer_id: ID.hansen, to_phone: '20304050', message: 'x', status: 'sent', created_at: '2026-11-16T08:00:00Z' }) === null)
  ok('kontrakt: customerId uden confirmed afvises', validateInbound({ ...mail, customer: { ...mail.customer, state: 'unique_match' } }).some((e) => /customerId/.test(e)))
  ok('kontrakt: dedupe-nøgle kræver kilde/hændelses-id', (() => { try { dedupeKeyFor('x', { table: 'manual', id: null }, null); return false } catch { return true } })())
  ok('kontrakt: samme kilde → samme dedupe-nøgle', dedupeKeyFor('mail', { table: 'incoming_emails', id: ID.hansen }, null) === mail.dedupeKey.replace(ID.case1824, ID.hansen))

  // ── 10. Upload-link ─────────────────────────────────────────────────────────────────────────────────────────────
  const now = new Date('2026-11-16T10:00:00Z')
  const req = { id: ID.hansen, conversation_id: null, customer_id: ID.hansen, service_case_id: null, expires_at: '2026-11-20T00:00:00Z', max_files: 2, files_uploaded: 0, revoked_at: null, created_by: null }
  ok('upload: gyldigt link', checkUploadRequest(req, now).ok)
  ok('upload: udløbet', (checkUploadRequest({ ...req, expires_at: '2026-11-15T00:00:00Z' }, now) as { reason?: string }).reason === 'expired')
  ok('upload: tilbagekaldt', (checkUploadRequest({ ...req, revoked_at: '2026-11-16T00:00:00Z' }, now) as { reason?: string }).reason === 'revoked')
  ok('upload: kvote brugt', (checkUploadRequest({ ...req, files_uploaded: 2 }, now) as { reason?: string }).reason === 'quota_used')
  ok('upload: ukendt token', (checkUploadRequest(null, now) as { reason?: string }).reason === 'invalid')
  const tok = newUploadToken()
  ok('upload: token 43 tegn base64url, kun hash gemmes', isWellFormedUploadToken(tok.token) && tok.hash === hashUploadToken(tok.token) && /^[0-9a-f]{64}$/.test(tok.hash) && !isWellFormedUploadToken('../../etc'))
  let writes = 0
  const noWrite = { from: () => { writes++; throw new Error('må ikke skrive') }, storage: { from: () => { writes++; throw new Error('må ikke skrive') } } }
  const tooBig = await acceptUploadFiles(noWrite, req, [{ name: 'a.jpg', type: 'image/jpeg', size: 16 * 1024 * 1024, bytes: Buffer.alloc(1) }])
  const badType = await acceptUploadFiles(noWrite, req, [{ name: 'a.exe', type: 'application/x-msdownload', size: 10, bytes: Buffer.alloc(1) }])
  const tooMany = await acceptUploadFiles(noWrite, req, [1, 2, 3].map((i) => ({ name: `${i}.jpg`, type: 'image/jpeg', size: 10, bytes: Buffer.alloc(1) })))
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
  ok('upload: indhold tjekkes (JPEG ok, exe forklædt som JPEG afvist)', contentMatchesType('image/jpeg', jpg) && !contentMatchesType('image/jpeg', Buffer.from('MZ ')) && contentMatchesType('application/pdf', Buffer.from('%PDF-1.7')))
  const fake = await acceptUploadFiles(noWrite, req, [{ name: 'a.jpg', type: 'image/jpeg', size: 4, bytes: Buffer.from('MZ!!') }])
  const total = await acceptUploadFiles(noWrite, req, [1, 2].map((i) => ({ name: `${i}.jpg`, type: 'image/jpeg', size: 5 * 1024 * 1024, bytes: Buffer.concat([jpg, Buffer.alloc(5 * 1024 * 1024 - 6)]) })))
  ok('upload: forklædt fil og > 9 MB samlet afvises før skrivning', !fake.ok && !total.ok && writes === 0)
  ok('upload: for stor/forkert type/for mange afvises FØR nogen skrivning', !tooBig.ok && !badType.ok && !tooMany.ok && writes === 0)
  const prevFlag = process.env.RECEPTION_UPLOAD_LINKS_ENABLED
  delete process.env.RECEPTION_UPLOAD_LINKS_ENABLED
  const { validateUploadToken } = await import('../src/lib/reception/upload-links')
  ok('upload: flag fra → disabled (selv med gyldigt token)', ((await validateUploadToken(noWrite, tok.token)) as { reason?: string }).reason === 'disabled' && writes === 0)
  if (prevFlag !== undefined) process.env.RECEPTION_UPLOAD_LINKS_ENABLED = prevFlag

  // ── 11. Ingen ekstern afsendelse ───────────────────────────────────────────────────────────────────────────────
  ok('flag: ekstern afsendelse findes ikke i fase 2', EXTERNAL_SENDS_ENABLED === false)
  ok('flag: LLM og upload-links er FRA som standard', !receptionLlmEnabled({}) && !uploadLinksEnabled({}))
  const files = [...readdirSync(join(process.cwd(), 'src', 'lib', 'reception')).map((f) => join('src', 'lib', 'reception', f)), join('src', 'lib', 'actions', 'henvendelser.ts'), join('src', 'lib', 'actions', 'upload-links-public.ts')]
  const SEND = /sendEmailViaGraph|sendEmailToCustomer|sendQuickReply|sendSms\(|sendMessage\(|createServiceCase\(|sendServiceCaseConfirmation|replyToCustomerEmail|\.messages\.create|fetch\(['"]https:\/\/(?!api\.openai\.com)/
  const offenders = files.filter((f) => SEND.test(readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')))
  ok('receptionist-koden kalder ingen afsendere og ikke createServiceCase (sender kundemail)', offenders.length === 0, offenders.join(', '))
  const aiFetch = files.filter((f) => /fetch\(/.test(readFileSync(join(process.cwd(), f), 'utf8')))
  ok('receptionist-koden laver ingen egne netværkskald (kun via ai-client)', aiFetch.length === 0, aiFetch.join(', '))

  // ── 12. Idempotent indtag + forslag (falsk DB, RLS-klient-lignende) ───────────────────────────────────────────
  const db = fakeDb()
  const actor = { supabase: db, userId: ID.hansen, hasPermission: (_p: Permission) => true }
  const t = await turn('Mit batteri går offline.', '20304050')
  const r1 = await ingestCommunication(actor, { ...mail, dedupeKey: 'mail:incoming_emails:x1', source: { table: 'incoming_emails', id: ID.hansen } }, t)
  const r2 = await ingestCommunication(actor, { ...mail, dedupeKey: 'mail:incoming_emails:x1', source: { table: 'incoming_emails', id: ID.hansen } }, t)
  ok('indtag: første = created, gentaget hændelse = duplicate (én henvendelse, ét item)', r1.outcome === 'created' && r2.outcome === 'duplicate' && db.rows('conversations').length === 1 && db.rows('conversation_items').length === 1)
  const convId = (r1 as { conversationId: string }).conversationId
  const a1 = await recordAndExecuteActions(actor, convId, t, { execute: false })
  const a2 = await recordAndExecuteActions(actor, convId, t, { execute: false })
  ok('forslag: gentaget kørsel → duplicate, ingen nye rækker', a2.every((x) => x.state === 'duplicate') && db.rows('conversation_actions').length === t.actions.length, JSON.stringify(a2))
  ok('forslag ved indtag: intet udføres (kun proposed/blocked)', a1.every((x) => x.state === 'proposed' || x.state === 'blocked'))
  const conv = db.rows('conversations')[0]
  ok('indtag: bekræftet kunde kun fra kildens menneskelige kobling', conv.customer_id === ID.hansen && conv.customer_match_state === 'confirmed')
  const tAmb = await turn('Mit batteri går offline.', '30303030')
  await ingestCommunication(actor, { ...auto, customer: { state: 'insufficient_information', customerId: null, candidateId: null, candidateCount: 0 }, dedupeKey: 'k2', source: { table: 'incoming_emails', id: ID.jensen } }, tAmb)
  const c2 = db.rows('conversations')[1]
  ok('indtag: tvetydig → ingen customer_id, ingen kandidat, status handoff', c2.customer_id === null && c2.customer_candidate_id === null && c2.customer_match_state === 'ambiguous' && c2.status === 'handoff')
  const failDb = fakeDb({ failInsert: 'conversations' })
  const rf = await ingestCommunication({ ...actor, supabase: failDb }, { ...mail, dedupeKey: 'k3' }, t)
  ok('indtag: skrivefejl → error (ikke created/tom succes)', rf.outcome === 'error')
  const denyDb = fakeDb({ failInsert: 'conversations', code: '42501' })
  const rd = await ingestCommunication({ ...actor, supabase: denyDb }, { ...mail, dedupeKey: 'k4' }, t)
  ok('indtag: RLS-afvisning → permission_denied', rd.outcome === 'error' && (rd as { error: string }).error === 'permission_denied')

  console.log(`\n${fail ? '❌' : '✅'} reception-test: ${pass} bestået, ${fail} fejlet`)
  process.exitCode = fail ? 1 : 0
}

/** Minimal PostgREST-lignende falsk klient med UNIQUE-nøgler (23505) — nok til indtag/forslag-stierne */
function fakeDb(opts: { failInsert?: string; code?: string } = {}) {
  const tables: Record<string, Array<Record<string, unknown>>> = { conversations: [], conversation_items: [], conversation_actions: [] }
  const uniques: Record<string, string[][]> = { conversations: [['dedupe_key']], conversation_items: [['dedupe_key']], conversation_actions: [['conversation_id', 'idempotency_key']] }
  let seq = 0
  const api = {
    rows: (t: string) => tables[t] ?? [],
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Record<string, unknown> | null = null
      const run = () => {
        const rows = tables[table] ?? []
        const match = (r: Record<string, unknown>) => filters.every(([k, v]) => r[k] === v)
        if (op === 'insert') {
          if (opts.failInsert === table) return { data: null, error: { code: opts.code ?? 'XX000', message: 'fail' } }
          for (const u of uniques[table] ?? []) if (rows.some((r) => u.every((k) => r[k] === payload![k]))) return { data: null, error: { code: '23505', message: 'dup' } }
          const row = { id: `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`, ...payload }
          rows.push(row); tables[table] = rows
          return { data: [row], error: null }
        }
        if (op === 'update') { const hit = rows.filter(match); for (const r of hit) Object.assign(r, payload); return { data: hit, error: null } }
        return { data: rows.filter(match), error: null }
      }
      const b = {
        select: () => b,
        insert: (p: Record<string, unknown>) => { op = 'insert'; payload = p; return b },
        update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return b },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
        maybeSingle: async () => { const r = run(); return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error } },
        single: async () => { const r = run(); return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error } },
        then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
      }
      return b
    },
  }
  return api
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
