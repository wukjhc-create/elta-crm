/**
 * Feature-batch på grok-features: telefoni, mailkort, tidslinje, fakturakontrol,
 * kommunikationsforhåndsvisning, CRM-spørgsmål og katalogopslag.
 * Ingen netværk, ingen database, ingen afsendelse.
 * Kør: npx tsx scripts/grok-features-batch-test.ts
 */
import { readFileSync } from 'node:fs'
import { buildCallCard } from '../src/lib/integrations/telephony/call-card'
import { relatelEnabled, relatelLiveCallEnabled, relatelSmsEnabled } from '../src/lib/integrations/telephony/flags'
import { ingestTelephonyEvent } from '../src/lib/integrations/telephony/ingest'
import { createRelatelProvider } from '../src/lib/integrations/telephony/provider'
import { summarizeTelephony } from '../src/lib/integrations/telephony/stats'
import { MemoryTelephonyStore, type TelephonyEvent } from '../src/lib/integrations/telephony/types'
import { parseRelatelWebhook } from '../src/lib/integrations/telephony/webhook'
import { decideRelatelWebhook } from '../src/lib/integrations/telephony/webhook-gate'
import { buildMailActionCard, extractMailAddress, type MailActionInput } from '../src/lib/mail/action-card'
import { classifyDocumentLabel } from '../src/lib/documents/classify-label'
import { composeTimeline, kindForNote, kindForTask } from '../src/lib/timeline/compose'
import { invoiceTrafficLight } from '../src/lib/invoice-control/traffic-light'
import type { InvoiceControl } from '../src/lib/invoice-control/engine'
import { previewCommunication } from '../src/lib/automation/comm-preview'
import { casesMissingPowerOfAttorney, explainCrmQuestion, followUpPreview, interpretCrmQuestion } from '../src/lib/assistant/crm-questions'
import { lookupKnownProducts } from '../src/lib/suppliers/product-lookup'
import { integrationBoard } from '../src/lib/integrations/status-board'
import type { CallerLookup } from '../src/lib/integrations/relatel/lookup'
import type { SupplierProductRef } from '../src/lib/pricing/supplier-compare'

let bad = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}
const truthy = (name: string, got: unknown) => eq(name, Boolean(got), true)

const OFF = {}
const MASTER = { RELATEL_ENABLED: 'true' }
const ALL_ON = { RELATEL_ENABLED: 'TRUE', RELATEL_LIVE_CALL_ENABLED: ' true ', RELATEL_SMS_ENABLED: 'true' }

eq('flags default fra', [relatelEnabled(OFF), relatelLiveCallEnabled(OFF), relatelSmsEnabled(OFF)], [false, false, false])
eq('live uden master er fra', relatelLiveCallEnabled({ RELATEL_LIVE_CALL_ENABLED: 'true' }), false)
eq('TRUE og omgivende mellemrum tænder', [relatelEnabled(ALL_ON), relatelLiveCallEnabled(ALL_ON)], [true, true])
eq('1 og yes tænder ikke', relatelEnabled({ RELATEL_ENABLED: '1' }) || relatelSmsEnabled({ ...MASTER, RELATEL_SMS_ENABLED: 'yes' }), false)
eq('sms kræver master og præcis true', relatelSmsEnabled({ ...MASTER, RELATEL_SMS_ENABLED: 'true' }), true)

async function providerChecks() {
  const off = createRelatelProvider(OFF)
  const armed = createRelatelProvider({ ...MASTER, RELATEL_LIVE_CALL_ENABLED: 'true', RELATEL_SMS_ENABLED: 'true' })
  eq('udbyder fra', off.mode, 'off')
  eq('udbyder test, aldrig active', armed.mode, 'test')
  const refused = await Promise.all([off.startCall('4571999999'), off.sendSms('4571999999', 'hej'), armed.startCall('4571999999'), armed.sendSms('4571999999', 'hej'), armed.listCalls()])
  eq('intet opkald eller sms placeres', refused.every((r) => r.ok === false && r.placed === false && r.sent === false), true)
  eq('slukket master forklarer flaget', refused[0].reason, 'Relatel er slået fra (RELATEL_ENABLED).')
  eq('armet klient ringer stadig ikke', refused[2].reason, 'Der er ikke koblet en live-klient på. Intet er sendt til Relatel.')
}

const canonical = {
  provider: 'relatel',
  event_id: 'evt-1',
  event_type: 'call.missed',
  occurred_at: '2026-10-31T08:00:00Z',
  direction: 'inbound',
  from: '71999999',
  to: '70123456',
  has_voicemail: true,
  call: { uuid: 'call-1', duration_seconds: 0, answered: false },
}
const parsedCanonical = parseRelatelWebhook(canonical)
eq('canonical ok', parsedCanonical.ok, true)
if (parsedCanonical.ok) {
  eq('canonical nøgle og skema', [parsedCanonical.event.idempotencyKey, parsedCanonical.event.schema, parsedCanonical.event.from, parsedCanonical.event.eventType, parsedCanonical.event.hasVoicemail], ['relatel:evt-1', 'canonical', '4571999999', 'call.missed', true])
}
const unverified = parseRelatelWebhook({ uuid: 'abc', direction: 'inbound', from: '+45 71 99 99 99', to: '4570123456', started_at: '2026-10-31T08:00:00Z' })
eq('uverificeret ubesvaret er missed', unverified.ok && unverified.event.schema === 'unverified_call' && unverified.event.eventType === 'call.missed' && unverified.event.idempotencyKey === 'relatel:call:abc:call.missed', true)
eq('afviser opkald uden numre', parseRelatelWebhook({ uuid: 'x', direction: 'inbound', started_at: '2026-10-31T08:00:00Z' }).ok, false)
eq('afviser ukendt type', parseRelatelWebhook({ provider: 'relatel', event_id: 'e', event_type: 'call.ringing', occurred_at: '2026-10-31T08:00:00Z', from: '71999999' }).ok, false)

const secretEnv = { ...MASTER, RELATEL_WEBHOOK_SECRET: 'test-secret-value' }
eq('webhook fra er 404', decideRelatelWebhook(OFF, 'test-secret-value', '{}').status, 404)
eq('webhook til uden hemmelighed er 503', decideRelatelWebhook(MASTER, null, '{}').status, 503)
eq('forkert hemmelighed er 401', decideRelatelWebhook(secretEnv, 'nope', '{}').status, 401)
eq('ulæselig json er 400', decideRelatelWebhook(secretEnv, 'test-secret-value', '{').status, 400)
eq('for stor krop er 413', decideRelatelWebhook(secretEnv, 'test-secret-value', 'x'.repeat(100_001)).status, 413)
const accepted = decideRelatelWebhook(secretEnv, 'test-secret-value', JSON.stringify(canonical))
eq('gyldig hændelse er 202 og ikke gemt', [accepted.status, accepted.body.accepted, accepted.body.persisted], [202, true, false])

async function ingestChecks() {
  if (!parsedCanonical.ok) return
  const store = new MemoryTelephonyStore()
  eq('første ingest', await ingestTelephonyEvent(store, parsedCanonical.event), 'created')
  eq('samme nøgle er dublet', await ingestTelephonyEvent(store, parsedCanonical.event), 'duplicate')
  eq('butikken har én række', store.events.length, 1)
}

function lookup(over: Partial<CallerLookup>): CallerLookup {
  return { number: '4571999999', matches: [], openCases: [], openOffers: [], ...over }
}
const flags = { liveCall: true, sms: true }
const unique = buildCallCard(lookup({
  matches: [
    { kind: 'customer', id: 'c1', customer_id: 'c1', label: 'Kjeld', detail: null },
    { kind: 'contact', id: 'k1', customer_id: 'c1', label: 'Kjeld', detail: 'kontakt' },
  ],
  openCases: [{ id: 's1', case_number: '2309', title: 'DCC', status: 'open', customer_id: 'c1' }],
}), flags)
eq('ét kunde-id er unikt', unique.matchStatus, 'unique')
eq('eksterne knapper er slået fra', unique.actions.filter((a) => a.id === 'click_to_call' || a.id === 'send_sms').every((a) => a.enabled === false), true)
eq('tilbageringning kræver bekræftelse', unique.actions.find((a) => a.id === 'create_callback')?.requiresConfirmation, true)
const ambiguous = buildCallCard(lookup({
  matches: [
    { kind: 'customer', id: 'c1', customer_id: 'c1', label: 'A', detail: null },
    { kind: 'customer', id: 'c2', customer_id: 'c2', label: 'B', detail: null },
  ],
}), { liveCall: false, sms: false })
eq('flere kunder vælges ikke', [ambiguous.matchStatus, ambiguous.customerId], ['ambiguous', null])
const lead = buildCallCard(lookup({ matches: [{ kind: 'lead', id: 'l1', customer_id: null, label: 'Lead', detail: 'lead' }] }), flags)
eq('lead uden kunde', lead.matchStatus, 'lead')
eq('intet match', buildCallCard(lookup({}), flags).matchStatus, 'none')
eq('ugyldigt nummer', buildCallCard({ number: null, matches: [], openCases: [], openOffers: [] }, flags).matchStatus, 'invalid')

const bare: TelephonyEvent = {
  idempotencyKey: 'relatel:none', provider: 'relatel', eventType: 'call.ended', occurredAt: '2026-10-31T08:00:00Z',
  direction: 'inbound', from: '4571999999', to: '4570123456', externalId: 'n', durationSeconds: null, answered: null, hasVoicemail: false, schema: 'canonical',
}
eq('manglende varighed er null', summarizeTelephony([bare]).averageDurationSeconds, null)
eq('gennemsnit afrundes', summarizeTelephony([{ ...bare, durationSeconds: 10 }, { ...bare, idempotencyKey: 'b', durationSeconds: 21 }]).averageDurationSeconds, 16)

const customer = { id: 'c1', name: 'Kjeld Rønnekilde', customerNumber: '1042', email: 'kjeld@example.test', address: null, postalCode: null, city: null }
const dccCase = { id: 's2309', caseNumber: '2309', title: 'DCC Energi', status: 'in_progress', customerId: 'c1', address: 'Polluxvej 4', postalCode: '4573', city: 'Højby' }
function mail(over: Partial<MailActionInput>): MailActionInput {
  return {
    subject: 'DCC Energi — Fuldmagt for Kjeld Rønnekilde',
    bodyText: 'Vedhæftet fuldmagt. Adressen er Polluxvej 4, 4573 Højby. Sag 2309.',
    bodyPreview: null,
    bodyHtml: null,
    senderEmail: 'submissions@formsubmit.co',
    senderName: 'FormSubmit',
    attachmentNames: ['fuldmagt.pdf'],
    linkedCustomerId: null,
    linkedCaseId: null,
    customers: [customer],
    customerSearch: 'ok',
    cases: [dccCase],
    casesStatus: 'ok',
    ...over,
  }
}
const dcc = buildMailActionCard(mail({}))
eq('DCC finder kunden', [dcc.customerStatus, dcc.customer?.id], ['unique', 'c1'])
eq('DCC finder adressen', dcc.address?.postalCode, '4573')
eq('DCC vælger sag 2309', [dcc.caseStatus, dcc.likelyCase?.caseNumber], ['likely', '2309'])
eq('DCC hensigt er fuldmagt', dcc.intent, 'power_of_attorney')
eq('intet forslag er udført', dcc.suggestions.every((s) => s.executed === false && s.requiresConfirmation === true), true)
truthy('forslag om at knytte mailen', dcc.suggestions.some((s) => s.id === 'attach_mail'))
truthy('forslag om at gemme fuldmagt', dcc.suggestions.some((s) => s.id === 'save_attachment'))
const twoNames = buildMailActionCard(mail({ customers: [customer, { ...customer, id: 'c2', customerNumber: '1043' }] }))
eq('to ens navne er tvetydige', [twoNames.customerStatus, twoNames.customer], ['ambiguous', null])
const close = buildMailActionCard(mail({
  subject: 'Fuldmagt',
  bodyText: 'Polluxvej 4, 4573 Højby',
  cases: [dccCase, { ...dccCase, id: 's2', caseNumber: '2310', title: 'Anden sag' }],
}))
eq('to lige sager vælges ikke', close.caseStatus, 'ambiguous')
const failedSearch = buildMailActionCard(mail({ customerSearch: 'failed', customers: [] }))
eq('fejlet søgning vælger ingen kunde', [failedSearch.customerStatus, failedSearch.customerReason], ['none', 'Kundesøgningen fejlede. Ingen kunde er valgt.'])
eq('ukendt fil forbliver ukendt', classifyDocumentLabel({ filename: 'foto-tag.jpg' }).kind, 'unknown')
eq('tomt navn opfinder ikke en type', classifyDocumentLabel({}).reason, 'intet filnavn eller emne at klassificere ud fra')
eq('adresse ud af DCC-teksten', extractMailAddress('Polluxvej 4, 4573 Højby')?.street, 'Polluxvej 4')

const timeline = composeTimeline([
  { sourceTable: 'customer_notes', sourceId: 'n1', kind: kindForNote('Opkaldsnote: ringede'), at: '2026-10-31T09:00:00Z', title: 'Note', summary: null, customerId: 'c1', caseId: null },
  { sourceTable: 'customer_notes', sourceId: 'n1', kind: 'note', at: '2026-10-31T10:00:00Z', title: 'Dublet', summary: null, customerId: 'c1', caseId: null },
  { sourceTable: 'customer_tasks', sourceId: 't1', kind: kindForTask('assistant_missed_call', 'Ring tilbage', 'Telefonsvarer: hej'), at: '2026-10-31T11:00:00Z', title: 'Missed', summary: null, customerId: 'c1', caseId: 's2309' },
  { sourceTable: 'customer_tasks', sourceId: 't2', kind: 'task', at: 'ikke-en-dato', title: 'Drop', summary: null, customerId: 'c1', caseId: null },
  { sourceTable: 'incoming_emails', sourceId: 'e1', kind: 'email', at: '2026-10-31T08:00:00Z', title: 'Mail', summary: null, customerId: null, caseId: null },
])
eq('tidslinje deduper, dropper og sorterer', timeline.map((e) => [e.kind, e.sourceId]), [['voicemail', 't1'], ['phone_note', 'n1']])

const okControl: InvoiceControl = { verdict: 'ok', lines: [{ lineNumber: 1, description: 'Kabel', verdict: 'ok', varianceAmount: 0, variancePct: 0, reason: 'inden for tolerance' }], controlledLines: 1, totalLines: 1, coveragePct: 100, overchargeAmount: 0 }
const pending = invoiceTrafficLight({ control: null, pending: true, duplicateOfId: 'inv-2', caseId: 's1', purchaseOrderId: 'po1' })
eq('afventende kontrol er ikke grøn', pending.light, 'unknown')
truthy('kendt dublet vises mens kontrollen kører', pending.findings.some((f) => f.code === 'duplicate' && f.light === 'red'))
eq('læsefejl er ukendt', invoiceTrafficLight({ control: null, loadFailed: true, caseId: 's1', purchaseOrderId: 'po1' }).light, 'unknown')
const over = invoiceTrafficLight({
  control: { verdict: 'deviation', lines: [{ lineNumber: 1, description: 'Kabel', verdict: 'overcharge', varianceAmount: 40, variancePct: 10, reason: 'over' }], controlledLines: 0, totalLines: 1, coveragePct: 0, overchargeAmount: 40 },
  caseId: 's1',
  purchaseOrderId: 'po1',
})
eq('overpris uden kontrollerede linjer har intet beløb', over.findings.find((f) => f.code === 'overcharge')?.amount, null)
eq('overpris er rød', over.light, 'red')
const green = invoiceTrafficLight({ control: okControl, caseId: 's1', purchaseOrderId: null })
eq('manglende indkøbsordre gør ikke en grøn faktura gul', green.light, 'green')
truthy('manglende ordre vises stadig', green.findings.some((f) => f.code === 'no_purchase_order'))
eq('dublet er rød', invoiceTrafficLight({ control: okControl, duplicateOfId: 'inv-9', caseId: 's1', purchaseOrderId: 'po1' }).light, 'red')

const preview = previewCommunication([
  { ruleId: 'offer.followup', entityId: 'o1', customerId: 'c1', label: 'Tilbud 88', ageDays: 3, reason: 'for ung' },
  { ruleId: 'offer.followup', entityId: 'o2', customerId: 'c1', label: 'Tilbud 89', ageDays: 4, reason: 'åbent tilbud' },
  { ruleId: 'callback.reminder', entityId: 't1', customerId: 'c1', label: 'Kjeld', ageDays: 0, reason: 'opringning' },
], undefined, { pausedAll: true })
eq('for ungt tilbud udelades', preview.some((p) => p.key === 'offer.followup:o1'), false)
eq('forhåndsvisning sender aldrig', preview.every((p) => p.wouldSend === false && p.dryRun === true && p.paused === true), true)
eq('pause-fri forhåndsvisning sender heller ikke', previewCommunication([{ ruleId: 'callback.reminder', entityId: 't1', customerId: 'c1', label: 'Kjeld', ageDays: 0, reason: 'nu' }]).every((p) => p.wouldSend === false), true)
eq('opfølgning bruger samme forhåndsvisning', followUpPreview([{ ruleId: 'inspection.reminder', entityId: 'b1', customerId: 'c1', label: 'Besigtigelse', ageDays: 2, reason: 'i morgen var i går' }])[0]?.wouldSend, false)

eq('skrivende spørgsmål udføres ikke', interpretCrmQuestion('Opret opgave for Lars på sag 2309').kind, 'write')
eq('flyt er en skrivende handling', interpretCrmQuestion('Flyt besigtigelse til fredag kl. 10').kind, 'write')
eq('skriv forklares uden udførelse', explainCrmQuestion({ kind: 'write', name: null, todayOnly: false, text: 'x' }).includes('godkender ikke'), true)
eq('i dag begrænser tilbageringninger', interpretCrmQuestion('Hvem ringede i dag, som vi ikke har ringet tilbage til?').todayOnly, true)
eq('fuldmagtsspørgsmål', interpretCrmQuestion('Hvilke sager mangler en fuldmagt?').kind, 'missing_poa')
eq('historik udtrækker navnet', interpretCrmQuestion('Hvad skete der med kunde Kjeld Rønnekilde?'), { kind: 'history', name: 'Kjeld Rønnekilde', todayOnly: false, text: 'Hvad skete der med kunde Kjeld Rønnekilde?' })
const poaCases = [
  { id: 's2309', caseNumber: '2309', title: 'DCC', customerId: 'c1', status: 'in_progress' },
  { id: 's1', caseNumber: '1', title: 'Lukket', customerId: 'c1', status: 'closed' },
  { id: 's2', caseNumber: '2', title: 'Dækket', customerId: 'c2', status: 'open' },
]
const poaDocs = [
  { customerId: 'c2', serviceCaseId: null, documentType: 'contract', description: JSON.stringify({ type: 'fuldmagt' }) },
  { customerId: 'c1', serviceCaseId: null, documentType: 'contract', description: 'ikke json fuldmagt' },
]
eq('kun den udækkede åbne sag mangler fuldmagt', casesMissingPowerOfAttorney(poaCases, poaDocs).map((c) => c.id), ['s2309'])
const assistantSrc = readFileSync(new URL('../src/lib/actions/crm-assistant.ts', import.meta.url), 'utf8')
eq('fejlet dokumentlæsning påstår ikke at ingen mangler', assistantSrc.includes('Dokumenterne kunne ikke læses. Ingen sag er markeret som manglende fuldmagt.'), true)

const products: SupplierProductRef[] = [
  { id: 'p1', supplierId: 'ao', supplierName: 'AO', sku: 'KABEL-1', name: 'Kabel', ean: '5701234567890', costPrice: null },
  { id: 'p2', supplierId: 'lm', supplierName: 'Lemvigh-Müller', sku: 'KABEL-1', name: 'Kabel', ean: '5701234567890', costPrice: 0 },
  { id: 'p3', supplierId: 'solar', supplierName: 'Solar', sku: 'KABEL-1', name: 'Kabel', ean: '5701234567890', costPrice: 12.5 },
]
const looked = lookupKnownProducts(products, { ean: '5701234567890' })
eq('ukendt og nulpris er null', looked.matches.filter((m) => m.supplierId !== 'solar').every((m) => m.purchasePrice === null && m.priceKnown === false), true)
eq('laveste kendte pris', looked.lowestKnown?.purchasePrice, 12.5)
eq('tomt opslag returnerer ikke kataloget', lookupKnownProducts(products, {}).matches.length, 0)

const board = integrationBoard({ RELATEL_WEBHOOK_SECRET: 'test-secret-value', RELATEL_ENABLED: 'true' }, { graphConfigured: false })
eq('relatel er test og ikke aktiv', board.find((r) => r.id === 'relatel')?.mode, 'test')
eq('hemmeligheden vises ikke', JSON.stringify(board).includes('test-secret-value'), false)
eq('klarpris og ordrer er fra', [board.find((r) => r.id === 'klarpris')?.mode, board.find((r) => r.id === 'supplier-orders')?.mode], ['off', 'off'])
eq('probe-fejl er den eneste error', integrationBoard({}, { probeError: 'Forbindelsen svarede ikke' }).filter((r) => r.mode === 'error').map((r) => r.id), ['probe'])

async function main() {
  await providerChecks()
  await ingestChecks()
  console.log(bad ? `\n❌ ${bad} fejl` : '\nALL PASS')
  process.exitCode = bad ? 1 : 0
}

void main()
