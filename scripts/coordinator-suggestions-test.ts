/**
 * C3 forslag + C2 signaludtræk — rene fixture-tests.  npx tsx scripts/coordinator-suggestions-test.ts
 */
import { buildSuggestions, type SuggestionInput, type SuggestionCase } from '../src/lib/coordinator/suggestions'
import { identifySender, type IdentityInput, type IdCustomer } from '../src/lib/coordinator/identity'
import { extractIdentitySignals } from '../src/lib/coordinator/identity-signals'
import { classifyInquiry } from '../src/lib/classification/inquiry-classifier'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }
const T0 = '2026-01-01T00:00:00Z', AT = '2026-11-01T10:00:00Z'
const cust = (id: string, o: Partial<IdCustomer> = {}): IdCustomer => ({ id, name: `Kunde ${id}`, email: null, phone: null, vat: null, address: null, autoCreated: false, createdAt: T0, ...o })
const ident = (o: Partial<IdentityInput> = {}) => identifySender({
  senderEmail: 'anna@example.dk', senderName: null, forwarded: { isForwarded: false, forwarderEmail: null, originalKnown: true }, webForm: null,
  textPhones: [], textVats: [], supplier: { isSupplier: false, reasons: [] }, automated: false, internalDomain: false, threadHumanCustomerIds: [],
  previousManualCustomerIds: [], customers: [], contacts: [], parties: [], employees: [], caseReferenceCustomerIds: [], receivedAt: AT, ...o })
const kase = (id: string, customerId: string, o: Partial<SuggestionCase> = {}): SuggestionCase => ({ id, caseNumber: `SVC-0${id.padStart(4, '0')}`, customerId, title: null, status: 'in_progress', closedAt: null, isProposal: false, updatedAt: T0, ...o })
const service = classifyInquiry({ customerMatch: { state: 'unique' }, textSignals: ['service_keywords'] })
const sales = classifyInquiry({ textSignals: ['sales_intent'] })
const sug = (o: Partial<SuggestionInput>) => buildSuggestions({ classification: service, identity: ident(), cases: [], mentionedCaseNumbers: [], threadCaseIds: [],
  linked: { customerId: null, linkedBy: null, serviceCaseId: null }, stageA: null, answered: false, ...o })

const A = [cust('A', { email: 'anna@example.dk' })]
let s = sug({ identity: ident({ customers: A }) })
ok('verificeret kunde → kobl til kunde', s.primary.kind === 'link_customer' && s.primary.customerId === 'A' && s.primary.level === 'verified')
ok('service uden åben sag → alternativ "opret servicesag"', s.alternatives.some((a) => a.kind === 'create_service_case'))
ok('kategori service, høj prioritet', s.category === 'service' && s.priority === 'high')
s = sug({ identity: ident({ customers: A }), cases: [kase('1', 'A')], mentionedCaseNumbers: ['SVC-00001'] })
ok('sagsnummer i mailen hos samme kunde → kunde + sag samlet', s.primary.kind === 'link_customer' && s.primary.caseId === '1')
s = sug({ identity: ident({ customers: A }), cases: [kase('1', 'A')] })
ok('kundens eneste åbne sag → kun alternativ (usikker), ikke automatisk', !s.primary.caseId && s.alternatives.some((a) => a.kind === 'link_case' && a.level === 'uncertain'))
s = sug({ identity: ident({ customers: A }), cases: [kase('1', 'B')], mentionedCaseNumbers: ['SVC-00001'] })
ok('nævnt sag hos anden kunde → advarsel, ikke primær', !s.primary.caseId && s.caseOptions[0]?.warning?.includes('anden kunde') === true)
s = sug({ identity: ident({ customers: A }), cases: [kase('1', 'A'), kase('2', 'A')] })
ok('flere åbne sager → alternativer, intet valgt', !s.primary.caseId && s.alternatives.filter((a) => a.kind === 'link_case').length === 2)

// Delt e-mail
s = sug({ identity: ident({ customers: [cust('A', { email: 'anna@example.dk' }), cust('B', { email: 'anna@example.dk' })] }) })
ok('delt e-mail → vælg mellem, to kunde-alternativer', s.primary.kind === 'choose_between' && s.alternatives.filter((a) => a.kind === 'link_customer').length === 2)
ok('delt e-mail → kategori mulig dublet', s.category === 'duplicate' || s.category === 'service')

// Domæne alene → ingen sagsforslag
const domParty = { id: 'P', name: 'Firma', kind: 'organisation' as const, customerId: 'A', supplierId: null, profileId: null, verifiedEmails: [], verifiedDomains: ['firma.dk'], vat: null, relationships: ['customer'] }
s = sug({ identity: ident({ senderEmail: 'ny@firma.dk', customers: [cust('A')], parties: [domParty] }), cases: [kase('1', 'A')] })
ok('domæne alene → ingen sag og ingen kundekobling foreslået', s.caseOptions.length === 0 && s.primary.kind !== 'link_customer' && !s.alternatives.some((a) => a.kind === 'link_case'))

// Ukendt afsender
s = sug({ classification: sales, identity: ident() })
ok('ukendt + salg → opret lead (ikke kunde)', s.primary.kind === 'create_lead' && s.category === 'sales')
s = sug({ identity: ident() })
ok('ukendt + service → opret kunde via dubletkontrol', s.primary.kind === 'create_customer')
s = sug({ classification: classifyInquiry({}), identity: ident() })
ok('ukendt uden signal → identificér afsender', s.primary.kind === 'identify_sender' && s.category === 'unknown_sender')

// Allerede koblet af menneske
s = sug({ identity: ident({ customers: A }), linked: { customerId: 'A', linkedBy: 'manual', serviceCaseId: 'X' } })
ok('koblet til kunde+sag af menneske → færdig', s.alreadyDone && s.primary.kind === 'no_action')
s = sug({ identity: ident({ customers: A }), linked: { customerId: 'A', linkedBy: 'manual', serviceCaseId: null }, cases: [kase('1', 'A')], mentionedCaseNumbers: ['SVC-00001'] })
ok('koblet kunde + nævnt sag → kobl til sag', s.primary.kind === 'link_case' && s.primary.caseId === '1')
s = sug({ identity: ident({ customers: A }), linked: { customerId: 'A', linkedBy: 'auto-ai', serviceCaseId: null } })
ok('auto-koblet → forslag om at bekræfte kunden', s.primary.kind === 'link_customer' && s.primary.customerId === 'A')

// Leverandør / automatisk / tilbagekald
s = sug({ classification: classifyInquiry({ supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, invoiceRegistered: true }), identity: ident({ supplier: { isSupplier: true, reasons: [] } }) })
ok('leverandørfaktura → bogholderi, admin, lav', s.primary.kind === 'route_bookkeeping' && s.category === 'admin' && s.priority === 'low')
s = sug({ identity: ident({ automated: true, senderEmail: 'noreply@x.dk' }), classification: classifyInquiry({ automatedSender: true }) })
ok('automatisk → ingen handling, lav', s.primary.kind === 'no_action' && s.priority === 'low')
s = sug({ identity: ident({ customers: A }), stageA: { urgency: 'emergency', callbackRequested: true } })
ok('tilbagekald + akut → kategori tilbagekald, akut', s.category === 'callback' && s.priority === 'urgent')

// Signaludtræk
const sig = extractIdentitySignals({ subject: 'SV: SVC-01006', body: 'Hej\nRing på 20 30 40 50\nCVR: 12 34 56 78\n\nFra: ELTA\nTlf 11223344 CVR 87654321\nTILBUD-2026-0007', forwarded: false }, { phones: ['+45 99 88 77 66'], vats: [] })
ok('telefon fra egen tekst', sig.phones.includes('4520304050'))
ok('CVR fra egen tekst', sig.vats.includes('12345678'))
ok('citeret historik giver ingen telefon/CVR', !sig.phones.includes('4511223344') && !sig.vats.includes('87654321'))
ok('CVR tolkes ikke som telefon', !sig.phones.includes('4512345678'))
ok('sagsnummer fra emne', sig.caseNumbers.includes('SVC-01006'))
ok('tilbudsnummer også fra citeret historik (reference)', sig.offerNumbers.includes('TILBUD-2026-0007'))
const own = extractIdentitySignals({ subject: '', body: 'Ring 99 88 77 66', forwarded: false }, { phones: ['+45 99887766'], vats: [] })
ok('ELTA\'s eget nummer filtreres', own.phones.length === 0)

console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — C3 forslag + C2 signaler`)
process.exitCode = fail ? 1 : 0
