/**
 * Tilbud ude taeller sendt og set der stadig er gyldige.
 *   npx tsx scripts/offers-out-count-test.ts
 */
import { readFileSync } from 'node:fs'
import { countOffersOut } from '../src/lib/offers/validity'
import { OFFER_STATUSES } from '../src/types/offers.types'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const day = new Date('2026-06-15T10:00:00Z')
const next = new Date('2026-06-16T10:00:00Z')
const rows = [
  { status: 'sent', valid_until: '2026-06-20' },
  { status: 'viewed', valid_until: '2026-06-15' },
  { status: 'sent', valid_until: '2026-06-14' },
  { status: 'sent', valid_until: null },
  { status: 'draft', valid_until: '2026-06-20' },
  { status: 'accepted', valid_until: '2026-06-20' },
  { status: 'rejected', valid_until: '2026-06-20' },
  { status: 'expired', valid_until: '2026-07-01' },
  { status: 'outstanding', valid_until: '2026-07-01' },
  { status: null, valid_until: '2026-07-01' },
]

ok(countOffersOut(rows, day) === 3, 'sendt og set der stadig er gyldige')
ok(countOffersOut([{ status: 'viewed', valid_until: '2026-06-15' }], next) === 0, 'dagen efter gyldig til taeller ikke')
ok(countOffersOut([], day) === 0, 'tom liste er nul')
ok(OFFER_STATUSES.join(',') === 'draft,sent,viewed,accepted,rejected,expired', 'statusserne bliver')

const page = readFileSync('src/components/modules/offers/offers-page-client.tsx', 'utf8')
ok(page.includes('data-testid="offers-out-count"'), 'maerket sidder paa tilbudslisten')
ok(page.includes('Tilbud ude: {countOffersOut(offers)}'), 'maerket bruger taelleren')
ok(page.includes('OFFER_STATUS_LABELS.sent') && page.includes('OFFER_STATUS_LABELS.viewed'), 'etiketterne er de eksisterende')

const detail = readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
ok(!detail.includes('offers-out-count'), 'detaljen har ikke maerket')
const dash = readFileSync('src/app/dashboard/page.tsx', 'utf8')
ok(!dash.includes('offers-out-count'), 'dashboardet har ikke maerket')

const actions = readFileSync('src/lib/actions/offers.ts', 'utf8')
ok(actions.includes("countQuery = countQuery.eq('status', filters.status)"), 'statusfilteret bliver')
ok(!actions.includes('offers-out'), 'listen henter ikke en ny status')

const rule = readFileSync('src/lib/offers/validity.ts', 'utf8')
ok(rule.includes('canCustomerRespond(offer.status, offer.valid_until, now)'), 'taelleren bruger gyldighedsreglen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offers-out-count-test')
