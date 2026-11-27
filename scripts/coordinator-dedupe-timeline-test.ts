/**
 * C4 dubletkontrol + C5 tidslinje — rene tests.  npx tsx scripts/coordinator-dedupe-timeline-test.ts
 */
import { duplicateReport, findDuplicateCandidates, namesSimilar, type DupCustomer } from '../src/lib/coordinator/duplicates'
import { dedupeInquiryInputs, isOutgoingEmail, offerEvents, caseEvents } from '../src/lib/timeline/enhanced'
import { composeTimeline, TIMELINE_FILTERS, type TimelineEventInput } from '../src/lib/timeline/compose'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }
const T0 = '2026-01-01T00:00:00Z'
const c = (id: string, o: Partial<DupCustomer> = {}): DupCustomer => ({ id, customerNumber: `C${id}`, name: `Kunde ${id}`, contactPerson: null, email: null, phones: [], vat: null, address: null, postalCode: null, autoCreated: false, createdAt: T0, ...o })

// Navnevarianter
ok('selskabsform ignoreres', namesSimilar('Hansen Elektro ApS', 'hansen elektro') === 'exact')
ok('ordrækkefølge/ekstra ord = lignende', namesSimilar('Jens Hansen', 'Jens Peter Hansen') === 'similar')
ok('forskellige navne', namesSimilar('Jens Hansen', 'Mette Olsen') === null)
ok('for korte navne matcher ikke løst', namesSimilar('Bo', 'Bo Jensen') === null)

// Kandidater
const reg = [
  c('1', { name: 'Jens Hansen', email: 'jens@example.dk', phones: ['20 30 40 50'] }),
  c('2', { name: 'Familien Hansen', email: 'jens@example.dk' }),
  c('3', { name: 'Solfirma ApS', vat: '12345678' }),
  c('4', { name: 'Mette Olsen', address: 'Vejen 1', postalCode: '8000' }),
  c('5', { name: 'Auto Kunde', email: 'auto+5@elta-crm.local', autoCreated: true }),
]
let r = findDuplicateCandidates({ email: 'JENS@example.dk' }, reg)
ok('samme e-mail (versaler) → to stærke kandidater (delt e-mail)', r.length === 2 && r.every((x) => x.strength === 'strong' && x.basis.includes('email')))
r = findDuplicateCandidates({ phone: '+4520304050' }, reg)
ok('telefon i andet format → stærk', r.length === 1 && r[0].customer.id === '1' && r[0].basis.includes('phone'))
r = findDuplicateCandidates({ vat: 'DK 12 34 56 78' }, reg)
ok('CVR med DK/mellemrum → stærk', r.length === 1 && r[0].customer.id === '3')
r = findDuplicateCandidates({ name: 'Solfirma' }, reg)
ok('samme navn uden selskabsform → muligt match (medium)', r.length === 1 && r[0].strength === 'medium' && r[0].basis.includes('name_exact'))
r = findDuplicateCandidates({ name: 'Mette Olsen', address: 'Vejen 1', postalCode: '8000' }, reg)
ok('navn + adresse → stærk', r[0]?.customer.id === '4' && r[0].strength === 'strong')
r = findDuplicateCandidates({ name: 'Jens Peter Hansen' }, reg)
ok('kun lignende navn alene → ingen støj-kandidat', r.length === 0)
r = findDuplicateCandidates({ email: 'auto+5@elta-crm.local' }, reg)
ok('pladsholder-e-mail matcher aldrig', r.length === 0)
r = findDuplicateCandidates({ email: 'jens@example.dk' }, reg, { excludeId: '1' })
ok('excludeId udelader kunden selv', r.length === 1 && r[0].customer.id === '2')

// Rapport
const rep = duplicateReport([...reg, c('6', { name: 'Solfirma', vat: '12345678', autoCreated: true })])
ok('rapport: delt e-mail-gruppe', rep.some((g) => g.basis === 'email' && g.customerIds.join() === '1,2'))
ok('rapport: CVR-gruppe med auto-kunde → forslag nævner automatisk oprettet', rep.some((g) => g.basis === 'vat' && g.autoCreated === 1 && g.suggestion.includes('Automatisk')))
ok('rapport: ingen grupper af én', rep.every((g) => g.customerIds.length >= 2))
ok('rapport: aldrig handling — kun forslag til manuel behandling', rep.every((g) => /manuelt/.test(g.suggestion)))

// C5 tidslinje
ok('udgående: ELTA-afsender', isOutgoingEmail('kontakt@eltasolar.dk', false) && !isOutgoingEmail('kontakt@eltasolar.dk', true) && !isOutgoingEmail('a@b.dk', false))
const ev = (t: string, id: string, kind: TimelineEventInput['kind'] = 'email'): TimelineEventInput => ({ sourceTable: t, sourceId: id, kind, at: T0, title: 'x', summary: null, customerId: 'C', caseId: null })
const inputs = [ev('incoming_emails', 'm1'), ev('incoming_emails', 'm2'), ev('conversations', 'k1', 'inquiry'), ev('conversations', 'k2', 'inquiry')]
const d = dedupeInquiryInputs(inputs, [
  { conversation_id: 'k1', source_table: 'incoming_emails', source_id: 'm1' },
  { conversation_id: 'k2', source_table: 'incoming_emails', source_id: 'm2' }, { conversation_id: 'k2', source_table: 'telephony_calls', source_id: 't1' },
])
ok('henvendelse kun med viste mails skjules (ingen dobbeltvisning)', !d.some((x) => x.sourceId === 'k1'))
ok('henvendelse med anden kanal bevares', d.some((x) => x.sourceId === 'k2'))
ok('mailen markeres behandlet som henvendelse', d.find((x) => x.sourceId === 'm1')?.summary === 'Behandlet som henvendelse')
const off = offerEvents({ id: 'o1', offer_number: 'TILBUD-2026-0001', title: 'Solceller', status: 'sent', created_at: T0, sent_at: '2026-01-02T00:00:00Z' }, 'C', null)
ok('tilbud: oprettet + sendt (to hændelser, forskellige nøgler)', off.length === 2 && composeTimeline(off).length === 2)
const cs = caseEvents({ id: 's1', case_number: 'SVC-00001', title: 'Fejl', created_at: T0, closed_at: '2026-02-01T00:00:00Z' }, 'C')
ok('sag: oprettet + lukket', cs.length === 2 && cs[1].kind === 'status')
ok('alle filtre dækker kendte typer', Object.values(TIMELINE_FILTERS).flat().length >= 15)

// Statisk: C5 læser med brugerens klient, ingen service-role/skrivning
const caseAct = readFileSync('src/lib/actions/case-communication-timeline.ts', 'utf8')
ok('sagstidslinje: ingen admin-klient', !/createAdminClient/.test(caseAct))
ok('sagstidslinje: ingen skrivning', !/\.(insert|update|upsert|delete)\(/.test(caseAct))
ok('sagstidslinje: flag + sagsadgang', /coordinatorEnabled\(\)/.test(caseAct) && /userCanViewCase\(/.test(caseAct))
ok('sagstidslinje: mail-vedhæftninger skjult uden customers.emails.view', /customers\.emails\.view[\s\S]{0,80}source_email_id/.test(caseAct))

console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — C4 dubletter + C5 tidslinje`)
process.exitCode = fail ? 1 : 0
