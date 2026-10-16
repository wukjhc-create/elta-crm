/**
 * O-1 (review 2026-10-16): regler for tilbudsrykkere (dry-run/plan) — accepteret/afvist/udløbet/erstattet udelukket,
 * cooldown, maks. antal, vindue, forslag, konverteret, deaktiveret kunde.
 * Kør: npx tsx scripts/offer-reminder-plan-test.ts
 */
import { evaluateOfferReminder, type OfferReminderCandidate } from '../src/lib/offers/offer-reminder-plan'

let fails = 0
function eq(name: string, got: unknown, want: unknown) {
  if (got === want) console.log(`PASS  ${name}`)
  else { fails++; console.log(`FAIL  ${name}: fik ${String(got)}, forventede ${String(want)}`) }
}

const now = new Date('2026-10-16T10:00:00Z')
const day = 86_400_000
const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString()
const rules = { now, intervalDays: 3, maxCount: 3 }
const base: OfferReminderCandidate = {
  id: 'o1', offer_number: 'T-1', title: 'Solceller', status: 'sent', is_proposal: false, converted_case_id: null,
  sent_at: iso(5 * day), last_reminder_sent: null, reminder_count: 0, valid_until: '2026-11-01', customer_id: 'c1',
  customer_name: 'Kunde', customer_active: true, superseded_by: null,
}
const ev = (o: Partial<OfferReminderCandidate>) => evaluateOfferReminder({ ...base, ...o }, rules)

eq('sendt for 5 dage siden, ingen rykker → berettiget', ev({}), null)
eq('set (viewed) → berettiget', ev({ status: 'viewed' }), null)
eq('accepteret → udelukket', ev({ status: 'accepted' }), 'status')
eq('afvist → udelukket', ev({ status: 'rejected' }), 'status')
eq('status udløbet → udelukket', ev({ status: 'expired' }), 'status')
eq('kladde → udelukket', ev({ status: 'draft' }), 'status')
eq('gyldig-til i går → udløbet', ev({ valid_until: '2026-10-15' }), 'expired')
eq('gyldig-til i dag tæller med', ev({ valid_until: '2026-10-16' }), null)
eq('erstattet revision → udelukket', ev({ superseded_by: 'o2' }), 'superseded')
eq('forslag → udelukket', ev({ is_proposal: true }), 'proposal')
eq('konverteret til sag → udelukket', ev({ converted_case_id: 'case1' }), 'converted')
eq('aldrig sendt → udelukket', ev({ sent_at: null }), 'not_sent')
eq('sendt for 61 dage siden → for gammel', ev({ sent_at: iso(61 * day) }), 'too_old')
eq('sendt for 2 dage siden → venter interval', ev({ sent_at: iso(2 * day) }), 'too_recent')
eq('rykket for 1 dag siden → cooldown', ev({ last_reminder_sent: iso(1 * day), reminder_count: 1 }), 'cooldown')
eq('rykket for 4 dage siden → berettiget (rykker 2)', ev({ last_reminder_sent: iso(4 * day), reminder_count: 1 }), null)
eq('3 rykkere sendt → maks.', ev({ reminder_count: 3 }), 'max_count')
eq('deaktiveret kunde → udelukket', ev({ customer_active: false }), 'inactive_customer')
eq('kunde uden aktiv-flag (null) → berettiget', ev({ customer_active: null }), null)

if (fails > 0) { console.log(`\n❌ ${fails} fejl`); process.exit(1) }
console.log('\nALL PASS')
