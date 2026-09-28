/**
 * Unit-test af den deterministiske opfoelgningsmotor (P3 #16). Faste datoer, ingen DB.
 *   npx tsx scripts/followup-engine-test.ts
 */
import { localDay, daysBetween, addDays, validOn } from '../src/lib/followup/calendar'
import { evaluateFollowups, DEFAULT_FOLLOWUP_CONFIG as CFG, type OfferSnap, type InvoiceSnap, type ThreadSnap } from '../src/lib/followup/engine'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

// ---- kalender
assert(localDay('2026-10-04T22:30:00Z') === '2026-10-05', 'UTC 22:30 i oktober = næste dag i København (sommertid)')
assert(localDay('2026-12-04T23:30:00Z') === '2026-12-05' && localDay('2026-12-04T22:30:00Z') === '2026-12-04', 'vintertid: +1 t')
assert(daysBetween('2026-10-24T22:30:00Z', '2026-10-26') === 1 && daysBetween('2026-10-24T21:00:00Z', '2026-10-26') === 2, 'omkring skift til vintertid (25/10): 22:30Z = 25/10 lokalt (1 dag), 21:00Z = 24/10 (2 dage)')
assert(daysBetween('2026-10-01', '2026-10-01') === 0 && daysBetween('2026-10-03', '2026-10-01') === -2, 'samme dag = 0; baglæns negativ')
assert(addDays('2026-12-30', 3) === '2027-01-02', 'addDays over nytår')
assert(validOn('2026-10-10', '2026-10-10') && !validOn('2026-10-10', '2026-10-11') && validOn(null, '2026-10-11'), 'gyldig TIL OG MED sidste dag')

const T = '2026-10-20'
const O = (x: Partial<OfferSnap>): OfferSnap => ({ id: 'o1', customer_id: 'k1', status: 'sent', sent_at: '2026-10-17T09:00:00Z', valid_until: null, reminder_count: 0, last_reminder_sent: null, has_open_followup_task: false, ...x })
const I = (x: Partial<InvoiceSnap>): InvoiceSnap => ({ id: 'i1', customer_id: 'k2', status: 'sent', final_amount: 1000, due_date: '2026-10-17', reminder_count: 0, last_reminder_at: null, ...x })
const M = (x: Partial<ThreadSnap>): ThreadSnap => ({ key: 't1', customer_id: 'k3', last_inbound_at: '2026-10-19T08:00:00Z', last_outbound_at: null, has_open_reply_task: false, ...x })
const run = (offers: OfferSnap[] = [], invoices: InvoiceSnap[] = [], threads: ThreadSnap[] = [], cfg = CFG) => evaluateFollowups({ offers, invoices, threads }, T, cfg)

// ---- tilbud
assert(run([O({})]).due[0]?.rule === 'offer.customer_reminder' && run([O({})]).due[0].level === 1, 'dag 3 efter afsendelse: påmindelse 1')
assert(run([O({ sent_at: '2026-10-18T09:00:00Z' })]).due.length === 0, 'dag 2: intet')
assert(run([O({ reminder_count: 1, last_reminder_sent: '2026-10-18T08:00:00Z' })]).due.length === 0, 'interval regnes fra sidste påmindelse')
assert(run([O({ valid_until: '2026-10-20' })]).due.length === 1 && run([O({ valid_until: '2026-10-19' })]).due.length === 0, 'udløbsdag inklusiv; dagen efter = intet')
{
  const r = run([O({ sent_at: '2026-10-10T09:00:00Z', reminder_count: 3, last_reminder_sent: '2026-10-19T08:00:00Z' })])
  assert(r.due.length === 1 && r.due[0].rule === 'offer.seller_task', 'påmindelser brugt op + ≥7 dage: sælger-opgave (ikke parallelt)')
}
assert(run([O({ sent_at: '2026-10-10T09:00:00Z', reminder_count: 1, last_reminder_sent: '2026-10-19T08:00:00Z' })]).due.length === 0, 'mens påmindelser pågår: ingen sælger-opgave')
assert(run([O({ sent_at: '2026-10-10T09:00:00Z', reminder_count: 3, has_open_followup_task: true })]).due.length === 0, 'åben opfølgningsopgave: ingen ny')
{
  const off = { ...CFG, offerReminders: { ...CFG.offerReminders, enabled: false } }
  assert(run([O({ sent_at: '2026-10-13T09:00:00Z' })], [], [], off).due[0]?.rule === 'offer.seller_task', 'påmindelser slået fra: sælger-opgave efter 7 dage')
}
assert(run([O({ is_proposal: true })]).due.length === 0 && run([O({ status: 'accepted' })]).due.length === 0 && run([O({ customer_id: null })]).due.length === 0, 'forslag/accepteret/uden kunde: intet')

// ---- fakturaer
assert(run([], [I({})]).due[0]?.level === 1, 'faktura 3 dage over forfald: rykker 1')
assert(run([], [I({ due_date: '2026-10-18' })]).due.length === 0, '2 dage: intet')
assert(run([], [I({ due_date: '2026-09-25', reminder_count: 0 })]).due[0]?.level === 1, '25 dage men ingen rykkere endnu: starter med L1 (springer aldrig niveauer over)')
assert(run([], [I({ due_date: '2026-10-08', reminder_count: 1, last_reminder_at: '2026-10-11T07:00:00Z' })]).due[0]?.level === 2, '12 dage, 1 sendt, cooldown ok: rykker 2')
assert(run([], [I({ due_date: '2026-10-08', reminder_count: 1, last_reminder_at: '2026-10-16T07:00:00Z' })]).due.length === 0, 'cooldown 5 kalenderdage respekteres')
{
  const r = run([], [I({ due_date: '2026-09-25', reminder_count: 2, last_reminder_at: '2026-10-10T07:00:00Z' })])
  assert(r.due[0]?.rule === 'invoice.manual_review' && r.due[0].action === 'manual_review', 'L3: manuel vurdering, ingen mail')
}
assert(run([], [I({ invoice_type: 'credit' }), I({ id: 'i2', final_amount: 0 }), I({ id: 'i3', voided_at: '2026-10-01' })]).due.length === 0, 'kreditnota/0 kr/annulleret: intet')

// ---- mails
assert(run([], [], [M({})]).due[0]?.priority === 'normal', 'ubesvaret 1 dag: opgave, normal')
assert(run([], [], [M({ last_inbound_at: '2026-10-10T08:00:00Z' })]).due[0]?.priority === 'urgent', '10 dage: urgent')
assert(run([], [], [M({ last_inbound_at: '2026-10-20T06:00:00Z' })]).due.length === 0, 'samme dag: intet')
assert(run([], [], [M({ last_outbound_at: '2026-10-19T09:00:00Z' })]).due.length === 0, 'besvaret: intet')

// ---- loft pr. kunde pr. dag
{
  const r = run([O({ customer_id: 'k9' })], [I({ customer_id: 'k9' })])
  assert(r.due.filter((d) => d.action === 'customer_reminder').length === 1 && r.due[0].entity_type === 'invoice' && r.deferred.length === 1 && r.deferred[0].entity_type === 'offer',
    'én kundepåmindelse pr. kunde pr. dag: faktura før tilbud, tilbud udskydes')
}

// ---- determinisme
{
  const offers = Array.from({ length: 30 }, (_, i) => O({ id: `o${i}`, customer_id: `k${i % 7}`, sent_at: `2026-10-${String(1 + (i % 16)).padStart(2, '0')}T09:00:00Z`, reminder_count: i % 4 }))
  const invoices = Array.from({ length: 20 }, (_, i) => I({ id: `i${i}`, customer_id: `k${i % 5}`, due_date: `2026-09-${String(10 + i).padStart(2, '0')}`, reminder_count: i % 3 }))
  const a = JSON.stringify(run(offers, invoices))
  const shuffled = (xs: any[]) => [...xs].sort((x, y) => (x.id.split('').reverse().join('') > y.id.split('').reverse().join('') ? 1 : -1))
  const b = JSON.stringify(run(shuffled(offers), shuffled(invoices)))
  assert(a === b, 'samme input i anden rækkefølge giver identisk resultat')
  const keys = JSON.parse(a).due.map((d: any) => d.key)
  assert(new Set(keys).size === keys.length, 'nøgler er unikke')
}

console.log(`\n${fails === 0 ? '✅ ALLE OPFØLGNINGSMOTOR-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
