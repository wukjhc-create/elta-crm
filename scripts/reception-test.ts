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
import { canDisclose, disclosableAt, disclosureLevel, verifyFacts, REQUIRED_LEVEL } from '../src/lib/reception/disclosure'
import { emergencyReply, EMERGENCY_TEMPLATE, APPROVED_EMERGENCY_ADDITIONS, UNAPPROVED_SAFETY_INSTRUCTION } from '../src/lib/reception/emergency-policy'
import { backgroundCapability, receptionBackgroundIngest, BACKGROUND_READ_TABLES, BackgroundCapabilityError } from '../src/lib/reception/background-actor'
import { receptionBackgroundEnabled } from '../src/lib/reception/flags'
import { evaluateAction, replyViolations, FORBIDDEN_COMMITMENTS } from '../src/lib/reception/action-policy'
import { runReceptionTurn, mergeClassification } from '../src/lib/reception/engine'
import { detectSignals, classifyIntent } from '../src/lib/reception/signals'
import { aiChat, aiStructured, type AiProvider } from '../src/lib/ai/ai-client'
import { validateLlmClassification } from '../src/lib/reception/llm-classify'
import { aiActorMayExecute, ACTION_PERMISSIONS } from '../src/lib/reception/ai-actor'
import { emailToInbound, portalToInbound, callToInbound, smsToInbound } from '../src/lib/reception/adapters'
import { validateInbound, dedupeKeyFor } from '../src/lib/reception/contract'
import { contentMatchesType, checkUploadRequest, acceptUploadFiles, hashUploadToken, isWellFormedUploadToken, newUploadToken, safeUploadName } from '../src/lib/reception/upload-links'
import { EXTERNAL_SENDS_ENABLED, uploadLinksEnabled, receptionLlmEnabled } from '../src/lib/reception/flags'
import { buildIngestPayload, callReceptionIngest, executeApprovedActions, ingestCommunication, mapIngestError } from '../src/lib/reception/henvendelser-core'
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
  ok('L1: kun opkalds-nummer (forfalskbart) — ingen sagsoplysninger', disclosureLevel({ identity: uniq, channel: 'phone', verification: 'not_attempted', strongVerification: false, failedAttempts: 0 }) === 1 && !canDisclose(1, 'case_status') && !canDisclose(1, 'relationship_exists') && canDisclose(2, 'relationship_exists'))
  ok('L2: bekræftet postnr.+vej → sagsstatus', disclosureLevel({ identity: uniq, channel: 'phone', verification: 'verified', strongVerification: false, failedAttempts: 0 }) === 2 && canDisclose(2, 'case_status') && !canDisclose(2, 'invoice_amounts'))
  ok('L3: kun stærk verifikation (portal)', disclosureLevel({ identity: uniq, channel: 'portal', verification: 'not_attempted', strongVerification: true, failedAttempts: 0 }) === 3)
  ok('2 mislykkede bekræftelser → L0', disclosureLevel({ identity: uniq, channel: 'phone', verification: 'verified', strongVerification: false, failedAttempts: 2 }) === 0)
  const facts = { postalCodes: ['8000'], streetNames: ['solvej'], caseNumbers: ['SVC-01824'] }
  ok('bekræftelse: postnr.+vejnavn (med husnr.) → verified', verifyFacts(facts, { postalCode: '8000', streetName: 'Solvej 4' }) === 'verified')
  ok('bekræftelse: sagsnummer ALENE → ikke nok (not_attempted, spørg om postnr.)', verifyFacts(facts, { caseNumber: 'svc 01824' }) === 'not_attempted')
  ok('bekræftelse: sagsnummer + postnr. → verified', verifyFacts(facts, { caseNumber: 'svc 01824', postalCode: '8000' }) === 'verified')
  ok('bekræftelse: sagsnummer + forkert postnr. → failed', verifyFacts(facts, { caseNumber: 'svc 01824', postalCode: '9999' }) === 'failed')
  ok('bekræftelse: postnr. ALENE → not_attempted', verifyFacts(facts, { postalCode: '8000' }) === 'not_attempted')
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
  const t3u = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '61616161')
  ok('L0 og L1 er udadtil ens (spørgsmålet afslører ikke, om nummeret er kunde)', t3u.level === 0 && t3u.reply === t3.reply, `${t3u.reply} ≠ ${t3.reply}`)
  const t3u2 = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '61616161', { claimed: { postalCode: '8000', streetName: 'Solvej 4' } })
  const t3amb = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '30303030')
  ok('review F4: tvetydigt nummer giver SAMME svar som ukendt (internt stadig handoff)', t3amb.reply === t3u.reply && !!t3amb.handoff?.reasons.includes('ambiguous_identity'), `${t3amb.reply} ≠ ${t3u.reply}`)
  const tReadErr = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '20304050', {}, { ...fakePorts(), identify: async () => ({ state: 'read_error', candidates: [], leadIds: [], keysUsed: [], error: 'boom' }) })
  ok('review F4: kundeopslag-fejl giver SAMME svar som ukendt', tReadErr.reply === t3u.reply, tReadErr.reply)
  ok('ukendt nummer + fakta: tæller som fejlet forsøg (som et forkert svar), intet afsløres', t3u2.verification === 'failed' && t3u2.level === 0 && !/status:/.test(t3u2.reply))
  ok('dato-spørgsmål → promise_date afvist, planlægnings-anmodning', t3.commitmentsRefused.includes('promise_date') && t3.actions.some((a) => a.type === 'create_planning_request'))
  const t4 = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '20304050', { claimed: { postalCode: '8000', streetName: 'Solvej 4' } })
  ok('bekræftet (L2) → ikke-følsom sagsstatus, stadig ingen dato-løfte', t4.level === 2 && /har status:/.test(t4.reply) && !/SVC-01824|Batteri/i.test(t4.reply) && /kan ikke love et tidspunkt/.test(t4.reply) && replyViolations(t4.reply).length === 0, t4.reply)
  const t4b = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '20304050', { claimed: { postalCode: '9999', streetName: 'Forkertvej' } })
  ok('bekræftelse fejlet (1. gang) → L1, ingen sagsdata', t4b.verification === 'failed' && t4b.level === 1 && !/SVC/.test(t4b.reply))
  const t4c = await turn('Jeg har en sag hos jer, hvornår kommer montøren?', '20304050', { claimed: { postalCode: '9999', streetName: 'Forkertvej' }, failedVerificationAttempts: 1 })
  ok('bekræftelse fejlet 2. gang → L0 + handoff verification_failed', t4c.level === 0 && !!t4c.handoff?.reasons.includes('verification_failed'))
  const t5 = await turn('Jeg har ingen strøm i huset.', '22222222')
  ok('ingen strøm: høj, handoff urgent_outage → service, ingen åben sag', t5.urgency === 'high' && !!t5.handoff?.reasons.includes('urgent_outage') && t5.handoff?.team === 'service' && t5.caseMatch.state === 'no_open_case')
  const t6 = await turn('Jeg vil klage over fakturaen.', '21212121')
  ok('fakturaklage: handoff dispute → bogholderi, høj', t6.intent === 'invoice_question' && !!t6.handoff?.reasons.includes('customer_dispute') && t6.handoff?.team === 'bogholderi' && t6.urgency === 'high')
  const t7 = await turn('Det slår gnister fra eltavlen og lugter brændt!', '20304050')
  ok('nød: svar = PRÆCIS den godkendte nød-tekst (ingen hovedafbryder/fejlsøgning/sagsdata)', t7.reply === emergencyReply() && !UNAPPROVED_SAFETY_INSTRUCTION.test(t7.reply) && !/SVC|status/i.test(t7.reply), t7.reply)
  ok('nød: emergency, 112, dispatch afvist, ingen udsendelse', t7.urgency === 'emergency' && /112/.test(t7.reply) && t7.commitmentsRefused.includes('dispatch_emergency') && !t7.actions.some((a) => a.type === 'dispatch_emergency' && a.outcome !== 'forbidden') && !!t7.handoff?.reasons.includes('safety_emergency'))
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
  ok('upload: brugt link (consumed) afvises — én afsendelse pr. link', (checkUploadRequest({ ...req, files_uploaded: 1, consumed_at: '2026-11-16T09:00:00Z' }, now) as { reason?: string }).reason === 'consumed')
  ok('upload: filnavn — sti, RTL-override og falsk endelse fjernes; endelse fra kontrolleret type', safeUploadName('..\\..\\evil\u202Egpj.exe', 'image/jpeg') === 'evilgpj.jpg' && safeUploadName('../../x.pdf', 'application/pdf') === 'x.pdf' && safeUploadName('', 'image/png') === 'fil.png')
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(8)])
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(8)])
  ok('upload: HEIC kræver HEIF-brand (MP4 forklædt som HEIC afvises)', contentMatchesType('image/heic', heic) && !contentMatchesType('image/heic', mp4))
  ok('upload: SVG/HTML/EXE kan aldrig accepteres (ikke i MIME-listen)', !contentMatchesType('image/svg+xml', Buffer.from('<svg')) && !contentMatchesType('text/html', Buffer.from('<html')))
  const usedReq = { ...req, files_uploaded: 1, consumed_at: '2026-11-16T09:00:00Z' }
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
  const replay = await acceptUploadFiles(noWrite, usedReq, [{ name: 'a.jpg', type: 'image/jpeg', size: 6, bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) }])
  ok('upload: replay af brugt link afvises før nogen skrivning', !replay.ok && writes === 0)
  // samtidige afsendelser: kun én reservation lykkes (optimistisk lås på consumed_at IS NULL)
  let reserved = false
  const chain = (onSelect: () => Promise<unknown>): Record<string, unknown> => { const c: Record<string, unknown> = {}; for (const m of ['eq', 'is', 'gt']) c[m] = () => c; c.select = onSelect; c.then = (res: (v: unknown) => void) => res({ data: null, error: null }); return c }
  const race = { from: (t: string) => { if (t !== 'upload_requests') throw new Error(t); return { update: () => chain(async () => { if (reserved) return { data: [], error: null }; reserved = true; return { data: [{ id: 'x' }], error: null } }) } }, storage: { from: () => ({ upload: async () => ({ error: { message: 'stop' } }) }) } }
  const okFile = [{ name: 'a.jpg', type: 'image/jpeg', size: 6, bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) }]
  const raceRes = await Promise.all([acceptUploadFiles(race, req, okFile), acceptUploadFiles(race, req, okFile)])
  ok('upload: to samtidige afsendelser → højst én reserverer linket', raceRes.filter((x) => !x.ok && /allerede brugt/.test((x as { error: string }).error)).length === 1, JSON.stringify(raceRes))
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
  // Nila/Relatel: ingen routing, ingen flag, ingen opkalds-/SMS-klient — kun den rene telefon-normalisering
  const strip = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const telOffenders = files.filter((f) => /RELATEL_|TELEPHONY_/.test(strip(f)) || /integrations\/relatel\/(?!phone)|integrations\/telephony|\bnila\b|routing|dial\(|originate|initiateCall|sendSms/i.test(strip(f)))
  ok('receptionist-koden rører ikke Nila, Relatel-routing/-flag, telefoni-persistens, opkald eller SMS', telOffenders.length === 0, telOffenders.join(', '))
  const envKeys = new Set(files.flatMap((f) => [...strip(f).matchAll(/process\.env\.([A-Z0-9_]+)|env\.([A-Z0-9_]+)/g)].map((m) => m[1] ?? m[2])))
  ok('receptionist-koden læser kun egne flag (RECEPTION_*) + app-URL', [...envKeys].every((k) => /^RECEPTION_|^NEXT_PUBLIC_(APP|SITE)_URL$/.test(k)), [...envKeys].join(','))

  // ── 12. Atomisk indtag via reception_ingest (final review S1) ────────────────────────────────────────────
  const t = await turn('Mit batteri går offline.', '20304050')
  const pl = buildIngestPayload(mail, t, { execute: false })
  ok('payload: kilde-reference + forventet bekræftet kunde (DB afleder og afviser ved uenighed)', pl.source_table === 'incoming_emails' && pl.source_id === mail.source.id && pl.confirmed_customer_id === mail.customer.customerId)
  ok('payload: ingen dedupe-nøgle/kanal/tid fra kalderen for en CRM-kilde', !('dedupe_key' in pl) && !('channel' in pl) && !('occurred_at' in pl) && !('provider' in pl))
  ok('payload: indtag fra kilde → ingen handling beder om udførelse', (pl.actions as Array<{ execute: boolean }>).every((a) => a.execute === false))
  const plx = buildIngestPayload(mail, t, { execute: true, mayExecute: (a) => (a.type === 'create_task' ? { allowed: false, reason: 'missing_user_permission' } : { allowed: true }) })
  const ctAct = (plx.actions as Array<{ action_type: string; execute: boolean; reasons: string[] }>).find((a) => a.action_type === 'create_task')
  ok('payload: AI-aktørens/medarbejderens afvisning → ingen execute + begrundelse', !!ctAct && !ctAct.execute && ctAct.reasons.some((r) => r.startsWith('ai_actor:')))
  const simComm = { ...mail, provider: 'simulator', source: { table: 'simulator' as const, id: null }, dedupeKey: 'sim:00000000-0000-4000-8000-000000000001', customer: { state: 'insufficient_information' as const, customerId: null, candidateId: null, candidateCount: 0 } }
  ok('payload: simulator sender sin sim-nøgle (DB kræver formatet)', buildIngestPayload(simComm, t, { execute: true }).dedupe_key === simComm.dedupeKey)
  ok('fejlkoder → stabile fejl', mapIngestError({ code: '42501' }) === 'permission_denied' && mapIngestError({ code: '23514' }) === 'source_mismatch' && mapIngestError({ code: 'PGRST202' }) === 'unavailable' && mapIngestError({ code: '0A000' }) === 'not_supported' && mapIngestError({ code: 'XX000' }) === 'insert_failed')
  const calls: string[] = []
  const rpcDb = (resp: { data: unknown; error: { code: string } | null }) => ({ rpc: async (fn: string) => { calls.push(fn); return resp }, from: () => { throw new Error('indtag må ikke skrive direkte i tabeller') } })
  const actor = { userId: ID.hansen, hasPermission: (_p: Permission) => true }
  const rc = await ingestCommunication({ ...actor, supabase: rpcDb({ data: { outcome: 'created', conversation_id: ID.hansen, item_id: ID.jensen, actions: [] }, error: null }) }, mail, t, { execute: false })
  const rdup = await ingestCommunication({ ...actor, supabase: rpcDb({ data: { outcome: 'duplicate', conversation_id: null }, error: null }) }, mail, t, { execute: false })
  const rerr = await ingestCommunication({ ...actor, supabase: rpcDb({ data: null, error: { code: '42501' } }) }, mail, t, { execute: false })
  ok('indtag: ÉT rpc-kald (reception_ingest), ingen direkte tabel-skrivning', calls.length === 3 && calls.every((c) => c === 'reception_ingest') && rc.outcome === 'created')
  ok('indtag: duplicate og RLS-afvisning mappes (aldrig tom succes)', rdup.outcome === 'duplicate' && rerr.outcome === 'error' && (rerr as { error: string }).error === 'permission_denied')
  const rweird = await callReceptionIngest(async () => ({ data: { outcome: 'created' }, error: null }), {})
  ok('indtag: ufuldstændigt svar → error (ikke created)', rweird.outcome === 'error')
  const ex = await executeApprovedActions({ ...actor, supabase: { from: () => { throw new Error('må ikke læse/skrive') } } }, ID.hansen, t, [
    { id: ID.hansen, type: 'create_task', state: 'proposed', idempotency_key: 'k1' }, { id: null, type: 'x', state: 'duplicate', idempotency_key: 'k2' }, { id: ID.jensen, type: 'alter_invoice', state: 'blocked', idempotency_key: 'k3' }])
  ok('udførelse: kun DB-godkendte (approved) handlinger udføres — forslag/blokeret/dublet røres ikke', ex.map((x) => x.state).join(',') === 'proposed,duplicate,blocked')

  // ── 13. Baggrundsaktøren (uden medarbejder) ─────────────────────────────────────────────────────────────────
  ok('baggrund: flag FRA som standard', !receptionBackgroundEnabled({}))
  const bgOff = await receptionBackgroundIngest(mail, 'Mit batteri går offline.', { capability: () => { throw new Error('må ikke bygges når flaget er fra') }, env: {} })
  ok('baggrund: flag fra → disabled, intet kald', bgOff.outcome === 'disabled')
  const adminCalls: string[] = []
  const fakeAdmin = {
    from: (tbl: string) => { adminCalls.push(`from:${tbl}`); const q: Record<string, unknown> = {}; for (const m of ['eq', 'not', 'order', 'limit', 'or', 'ilike', 'range', 'in']) q[m] = () => q; q.maybeSingle = async () => ({ data: null, error: null }); q.then = (res: (v: unknown) => void) => res({ data: [], error: null }); return { select: () => q, insert: () => { throw new Error('insert') }, update: () => { throw new Error('update') }, delete: () => { throw new Error('delete') } } },
    rpc: async (fn: string, args: { p: Record<string, unknown> }) => { adminCalls.push(`rpc:${fn}`); lastBg = args.p; return { data: { outcome: 'created', conversation_id: ID.hansen, item_id: ID.jensen, actions: [{ id: ID.hansen, type: 'create_task', state: 'proposed', idempotency_key: 'k' }] }, error: null } },
    storage: { from: () => { throw new Error('storage') } },
  }
  let lastBg: Record<string, unknown> | null = null
  const cap = backgroundCapability(fakeAdmin)
  ok('baggrund: læse-port nægter tabeller uden for allowlisten', (() => { try { cap.readPort.from('invoices'); return false } catch (e) { return e instanceof BackgroundCapabilityError } })())
  ok('baggrund: læse-port giver KUN select (ingen insert/update/delete)', Object.keys(cap.readPort.from('customers')).join(',') === 'select')
  ok('review F9: læse-porten nægter indlejrede relationer', (() => { try { cap.readPort.from('customers').select('id, incoming_emails(*)'); return false } catch (e) { return e instanceof BackgroundCapabilityError } })())
  ok('baggrund: allowlist = kunder, kontakter, leads, sager', BACKGROUND_READ_TABLES.join(',') === 'customers,customer_contacts,leads,service_cases')
  const bgComm = { ...mail, customer: { state: 'unique_match' as const, customerId: null, candidateId: ID.hansen, candidateCount: 1 } }
  const bg = await receptionBackgroundIngest(bgComm, 'Mit batteri går offline.', { capability: () => cap, env: { RECEPTION_BACKGROUND_ENABLED: 'true' } })
  ok('baggrund: created med forslag; eneste skrivevej = rpc:reception_ingest', bg.outcome === 'created' && adminCalls.filter((c) => c.startsWith('rpc:')).join() === 'rpc:reception_ingest', JSON.stringify(adminCalls))
  ok('baggrund: ALLE handlinger sendes uden execute (kun forslag)', !!lastBg && (lastBg.actions as Array<{ execute: boolean }>).every((a) => a.execute === false))
  const srcBg = readFileSync(join(process.cwd(), 'src', 'lib', 'reception', 'background-actor.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  ok('baggrund (kildescan): ingen insert/update/delete/upsert/storage/andre rpc i modulet', !/\.(insert|update|delete|upsert)\(|\.storage\b|createAdminClient/.test(srcBg) && (srcBg.match(/\.rpc\(/g) ?? []).length === 1)

  // ── 14. Oplysningsmatrix (deterministisk) ───────────────────────────────────────────────────────────────────
  ok('matrix L0 = kun firmaviden', disclosableAt(0).join(',') === 'company_info')
  ok('matrix L1 = som L0 udadtil', disclosableAt(1).join(',') === 'company_info')
  ok('matrix L2 = + kundeforhold + status-kategori', disclosableAt(2).join(',') === 'company_info,relationship_exists,case_status')
  ok('matrix L3 = + sagsnumre + besøgsdato (information)', disclosableAt(3).join(',') === 'company_info,relationship_exists,case_status,case_numbers,next_visit_date')
  ok('matrix: kontaktdata/beløb/dokumenter/sagsdetaljer/medarbejdernavne ALDRIG (heller ikke L3)', (['contact_details', 'invoice_amounts', 'documents', 'case_details', 'employee_names'] as const).every((k) => REQUIRED_LEVEL[k] === null && !canDisclose(3, k)))
  ok('matrix: opkalds-nummer/afsender-mail giver højst L1 (uden fakta)', disclosureLevel({ identity: { state: 'unique_match' }, channel: 'email', verification: 'not_attempted', strongVerification: false, failedAttempts: 0 }) === 1)

  // ── 15. Nød-politik ─────────────────────────────────────────────────────────────────────────────────────────
  ok('nød: skabelonen nævner 112 og at gå væk fra faren — intet om at betjene installationen', /112/.test(EMERGENCY_TEMPLATE) && /væk fra faren/.test(EMERGENCY_TEMPLATE) && !UNAPPROVED_SAFETY_INSTRUCTION.test(emergencyReply()))
  ok('nød: ingen godkendte tilføjelser endnu (kræver særskilt godkendelse)', APPROVED_EMERGENCY_ADDITIONS.length === 0)
  const allReplies = await Promise.all(SCENARIOS.map((sc) => turn(sc.text, sc.phone, sc.claimed ? { claimed: sc.claimed } : {})))
  ok('ingen svar i nogen scenarie indeholder improviserede el-instruktioner', allReplies.every((x) => !UNAPPROVED_SAFETY_INSTRUCTION.test(x.reply)), allReplies.map((x) => x.reply).find((r) => UNAPPROVED_SAFETY_INSTRUCTION.test(r)) ?? '')
  const gn = await turn('Der er røg og gnister fra inverteren, hvad skal jeg slå fra?', '20304050', {}, { ...fakePorts(), classify: async () => ({ ok: true, value: { intent: 'service_fault', confidence: 0.99, proposedActions: ['dispatch_emergency'] } }) })
  ok('nød: LLM bliver ikke spurgt og kan ikke nedgradere/tilføje udsendelse', gn.urgency === 'emergency' && gn.reply === emergencyReply() && gn.classificationSource === 'keywords' && !gn.actions.some((a) => a.type === 'dispatch_emergency'))

  // ── 16. Én kontrakt for alle kanaler (ingen parallel forretningslogik) ─────────────────────────────────────
  const callC = callToInbound({ id: ID.nielsen, provider: 'relatel', provider_call_id: 'c-1', direction: 'inbound', started_at: '2026-11-16T08:00:00Z', external_number_normalized: '4520304050', customer_id: null, suggested_customer_id: null, candidate_count: 0, missed: true, has_voicemail: false, service_case_id: null })!
  const smsC = smsToInbound({ id: ID.jensen, customer_id: null, to_phone: null, message: 'Hej', status: 'received', created_at: '2026-11-16T08:00:00Z', direction: 'inbound', from_phone: '20304050' })!
  const portalC = portalToInbound({ id: ID.hansen, customer_id: ID.hansen, sender_type: 'customer', sender_name: 'Hansen', message: 'Hej', attachments: [], created_at: '2026-11-16T08:00:00Z' })!
  const allC = [mail, portalC, callC, smsC]
  ok('kontrakt: mail, portal, telefoni og SMS giver alle gyldig InboundCommunication', allC.every((c) => validateInbound(c).length === 0))
  ok('kontrakt: dedupe-nøgler = databasens afledning (reception_source_identity)', mail.dedupeKey === `mail:incoming_emails:${mail.source.id}` && portalC.dedupeKey === `portal:portal_messages:${ID.hansen}` && callC.dedupeKey === `relatel:telephony_calls:${ID.nielsen}`)
  ok('kontrakt: samme payload-bygger for alle kanaler', allC.every((c) => buildIngestPayload(c, null, { execute: false }).source_table === c.source.table))
  const coreSrc = ['adapters.ts', 'henvendelser-core.ts', 'background-actor.ts'].map((f) => readFileSync(join(process.cwd(), 'src', 'lib', 'reception', f), 'utf8')).join('\n')
  ok('ingen kanal-specifik indtags-logik uden for reception_ingest (ingen direkte insert i conversations/items)', !/from\(['"]conversations['"]\)\.insert|from\(['"]conversation_items['"]\)\.insert/.test(coreSrc))
  const tlSrc = readFileSync(join(process.cwd(), 'src', 'lib', 'actions', 'communication-timeline.ts'), 'utf8')
  ok('tidslinje: henvendelser vises i den EKSISTERENDE kunde-tidslinje (ingen ny tidslinje)', /inquiries/.test(tlSrc) && !readdirSync(join(process.cwd(), 'src', 'lib', 'reception')).some((f) => /timeline/i.test(f)))

  console.log(`\n${fail ? '❌' : '✅'} reception-test: ${pass} bestået, ${fail} fejlet`)
  process.exitCode = fail ? 1 : 0
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
