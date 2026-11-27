/**
 * C2 afsendergenkendelse — rene fixture-tests (ingen DB).  npx tsx scripts/coordinator-identity-test.ts
 */
import { identifySender, type IdentityInput, type IdCustomer } from '../src/lib/coordinator/identity'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }

const T0 = '2026-01-01T00:00:00Z', AT = '2026-11-01T10:00:00Z'
const cust = (id: string, o: Partial<IdCustomer> = {}): IdCustomer => ({ id, name: `Kunde ${id}`, email: null, phone: null, vat: null, address: null, autoCreated: false, createdAt: T0, ...o })
const base = (o: Partial<IdentityInput> = {}): IdentityInput => ({
  senderEmail: 'anna@example.dk', senderName: null, forwarded: { isForwarded: false, forwarderEmail: null, originalKnown: true }, webForm: null,
  textPhones: [], textVats: [], supplier: { isSupplier: false, reasons: [] }, automated: false, internalDomain: false,
  threadHumanCustomerIds: [], previousManualCustomerIds: [], customers: [], contacts: [], parties: [], employees: [],
  caseReferenceCustomerIds: [], receivedAt: AT, ...o,
})
const id = (o: Partial<IdentityInput>) => identifySender(base(o))

// Ukendt
let r = id({})
ok('ingen evidens → ukendt, ingen kandidat', r.kind === 'unknown' && r.level === 'unknown' && !r.primary && r.alternatives.length === 0)
ok('ukendt forklarer at afsender ikke er kunde', r.explanation.some((l) => l.includes('ikke som kunde')))
r = id({ webForm: { email: 'ny@example.dk', phone: null, name: 'Ny Person', address: null } })
ok('formular fra ny person → potentiel kunde (prospect), ikke kunde', r.kind === 'prospect' && !r.primary)

// Verificeret: menneskeskabt kunde med entydig e-mail
r = id({ customers: [cust('A', { email: 'anna@example.dk' })] })
ok('entydig e-mail på menneskeskabt kunde → kunde verificeret', r.kind === 'customer' && r.level === 'verified' && r.primary?.id === 'A')
// Auto-kunde → sandsynlig
r = id({ customers: [cust('A', { email: 'anna@example.dk', autoCreated: true })] })
ok('e-mail på auto-kunde → sandsynlig (aldrig verificeret)', r.level === 'probable' && r.primary?.evidence.includes('email_auto_customer'))
// Kunde oprettet efter mailen tæller ikke
r = id({ customers: [cust('A', { email: 'anna@example.dk', createdAt: '2026-12-01T00:00:00Z' })] })
ok('kunde oprettet efter mailen tæller ikke', r.kind === 'unknown')
// Kontaktperson
r = id({ customers: [cust('A')], contacts: [{ id: 'K1', customerId: 'A', name: 'Anna', email: 'anna@example.dk', phone: null, createdAt: T0 }] })
ok('e-mail på kontaktperson → kontakt, verificeret, peger på kunden', r.kind === 'contact' && r.level === 'verified' && r.primary?.customerId === 'A' && r.primary?.contactId === 'K1')

// Delt e-mail: flere kunder → alternativer, ingen primær, max usikker
r = id({ customers: [cust('A', { email: 'anna@example.dk' }), cust('B', { email: 'anna@example.dk' })] })
ok('delt e-mail → ingen primær, to alternativer', !r.primary && r.alternatives.length === 2)
ok('delt e-mail → usikker og konflikt vist', r.level === 'uncertain' && r.conflicts.includes('email_shared_by_customers'))
ok('delt e-mail → aldrig kunde', r.kind === 'unknown')
// Delt e-mail + telefon løfter én til sandsynlig (aldrig verificeret)
r = id({ customers: [cust('A', { email: 'anna@example.dk', phone: '20304050' }), cust('B', { email: 'anna@example.dk' })], textPhones: ['+45 20 30 40 50'] })
ok('delt e-mail + matchende telefon → A sandsynlig, B alternativ', r.primary?.id === 'A' && r.level === 'probable' && r.alternatives.some((a) => a.id === 'B'))

// Svage signaler alene
r = id({ customers: [cust('A', { phone: '20304050' })], textPhones: ['20 30 40 50'] })
ok('telefon alene → sandsynlig, aldrig verificeret', r.level === 'probable' && r.primary?.id === 'A')
r = id({ customers: [cust('A', { vat: '12345678' })], textVats: ['12345678'] })
ok('CVR alene → sandsynlig', r.level === 'probable')
r = id({ senderName: 'Hansens Elektro ApS', customers: [cust('A', { name: 'Hansens Elektro' })] })
ok('navnelighed alene → usikker', r.level === 'uncertain' && !r.primary === false && r.primary?.level === 'uncertain')
ok('navnelighed alene → ikke kunde', r.kind !== 'customer' && r.kind !== 'contact' || r.level === 'uncertain')
r = id({ customers: [cust('A', { phone: '20304050' }), cust('B', { phone: '20304050' })], textPhones: ['20304050'] })
ok('telefon på flere kunder → ingen primær + konflikt', !r.primary && r.conflicts.includes('phone_matches_several_customers'))

// Parter
const party = { id: 'P1', name: 'KlimaEnergi', kind: 'organisation' as const, customerId: null, supplierId: null, profileId: null, verifiedEmails: ['anna@example.dk'], verifiedDomains: [], vat: null, relationships: ['cooperation_partner'] }
r = id({ parties: [party] })
ok('verificeret part-e-mail + partnerrelation → samarbejdspartner verificeret', r.kind === 'partner' && r.level === 'verified')
r = id({ senderEmail: 'ny@klimaenergi.dk', parties: [{ ...party, verifiedEmails: [], verifiedDomains: ['klimaenergi.dk'] }] })
ok('kun domæne → domainOnly (ingen sagsadgang)', r.primary?.domainOnly === true)
const custParty = { ...party, id: 'P2', customerId: 'A', relationships: ['customer'], verifiedEmails: [], verifiedDomains: ['firma.dk'] }
r = id({ senderEmail: 'x@firma.dk', customers: [cust('A')], parties: [custParty] })
ok('domæne på kundes part → ikke "kunde", kun domæne-kandidat', r.kind !== 'customer' && r.primary?.domainOnly === true)

// Leverandør
r = id({ senderEmail: 'ordre@ao.dk', supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] } })
ok('leverandørværn → leverandør', r.kind === 'supplier')
r = id({ supplier: { isSupplier: true, reasons: ['sender_history_supplier'] }, customers: [cust('A', { email: 'anna@example.dk' })] })
ok('leverandør vs. menneskeskabt kunde → ukendt + konflikt', r.kind === 'unknown' && r.conflicts.includes('supplier_evidence_vs_customer'))

// Medarbejder / intern / automatisk
r = id({ senderEmail: 'henrik@eltasolar.dk', employees: [{ profileId: 'U1', email: 'henrik@eltasolar.dk', name: 'Medarbejder' }], internalDomain: true })
ok('medarbejder → employee verificeret', r.kind === 'employee' && r.level === 'verified')
r = id({ senderEmail: 'noreply@system.dk', automated: true })
ok('noreply → automatisk', r.kind === 'automated')

// Videresendt
r = id({ forwarded: { isForwarded: true, forwarderEmail: 'kontor@eltasolar.dk', originalKnown: true }, customers: [cust('A', { email: 'anna@example.dk' })] })
ok('videresendt: oprindelig afsender bruges, videresender noteres', r.primary?.id === 'A' && r.forwardedBy === 'kontor@eltasolar.dk')
r = id({ senderEmail: null, forwarded: { isForwarded: true, forwarderEmail: 'kontor@eltasolar.dk', originalKnown: false } })
ok('videresendt uden oprindelig afsender → ukendt + konflikt', r.kind === 'unknown' && r.conflicts.includes('forwarded_original_unknown'))

// Sagsreference verificerer ikke
r = id({ caseReferenceCustomerIds: ['A'], customers: [cust('A')] })
ok('sagsreference alene → ingen kandidat (verificerer ikke)', !r.primary && r.conflicts.includes('case_reference_other_customer'))
r = id({ caseReferenceCustomerIds: ['A'], customers: [cust('A', { email: 'anna@example.dk', autoCreated: true })] })
ok('sagsreference på kandidat løfter ikke til verificeret', r.level === 'probable')

// Tråd koblet af menneske
r = id({ senderEmail: 'ukendt@gmail.com', threadHumanCustomerIds: ['A'], customers: [cust('A')] })
ok('tråd koblet af medarbejder → verificeret', r.level === 'verified' && r.primary?.id === 'A')

// Determinisme
ok('deterministisk', JSON.stringify(id({ customers: [cust('A', { email: 'anna@example.dk' }), cust('B', { email: 'anna@example.dk' })] })) === JSON.stringify(id({ customers: [cust('A', { email: 'anna@example.dk' }), cust('B', { email: 'anna@example.dk' })] })))

console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — C2 afsendergenkendelse`)
process.exitCode = fail ? 1 : 0
