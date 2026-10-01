/** Unit: tilbudsopfølgning for sælger (N1). Kør: npx tsx scripts/offer-followup-test.ts */
import { buildOfferFollowups, type OpenOffer } from '../src/lib/followup/offer-followup'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
const base: OpenOffer = { id: 'x', offer_number: 'T-1', title: 't', status: 'sent', sent_at: '2026-10-01T08:00:00Z', viewed_at: null, valid_until: '2026-10-31',
  final_amount: 1000, reminder_count: 0, last_reminder_sent: null, customer_name: 'K', customer_phone: null, has_open_task: false }
const one = (o: Partial<OpenOffer>, today: string) => buildOfferFollowups([{ ...base, ...o }], today)[0]
eq('2 dage, ikke set -> afventer', one({}, '2026-10-03').stage, 'waiting')
eq('3 dage, ikke set -> ikke åbnet', one({}, '2026-10-04').stage, 'not_opened')
eq('3 dage, set -> ring', one({ status: 'viewed', viewed_at: '2026-10-02T10:00:00Z' }, '2026-10-04').stage, 'call')
eq('8 dage, set -> ring (prioritet 1)', one({ status: 'viewed' }, '2026-10-09').priority, 1)
eq('ikke åbnet 8 dage over ikke åbnet 4 dage', one({}, '2026-10-09').priority < one({}, '2026-10-05').priority, true)
eq('udløber om 2 dage -> udløber', one({ valid_until: '2026-10-11' }, '2026-10-09').stage, 'expiring')
eq('udløber i dag -> overskrift', one({ valid_until: '2026-10-09' }, '2026-10-09').headline, 'Udløber i dag')
eq('udløbet -> expired', one({ valid_until: '2026-10-05' }, '2026-10-09').stage, 'expired')
eq('kladde/accepteret indgår ikke', buildOfferFollowups([{ ...base, status: 'draft' }, { ...base, id: 'y', status: 'accepted' }], '2026-10-09').length, 0)
eq('uden sent_at indgår ikke', buildOfferFollowups([{ ...base, sent_at: null }], '2026-10-09').length, 0)
eq('sendt sent aftenen (23:30 dansk) tæller som samme dag', one({ sent_at: '2026-10-01T21:30:00Z' }, '2026-10-04').days_since_sent, 3)
eq('påmindelser + opgave nævnes', /2 påmindelse\(r\) sendt · åben opfølgningsopgave/.test(one({ reminder_count: 2, has_open_task: true }, '2026-10-05').detail), true)
const sorted = buildOfferFollowups([{ ...base, id: 'a', offer_number: 'A' }, { ...base, id: 'b', offer_number: 'B', status: 'viewed', valid_until: '2026-10-10' }, { ...base, id: 'c', offer_number: 'C', sent_at: '2026-10-08T08:00:00Z' }], '2026-10-09')
eq('sortering: udløber først, afventer sidst', sorted.map((s) => s.offer.id), ['b', 'a', 'c'])
eq('deterministisk', JSON.stringify(buildOfferFollowups([{ ...base }], '2026-10-09')) === JSON.stringify(buildOfferFollowups([{ ...base }], '2026-10-09')), true)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle tilbudsopfølgnings-tests PASS')
process.exitCode = fail ? 1 : 0
