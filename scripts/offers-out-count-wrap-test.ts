/**
 * Tilbud ude-maerket kan krympe. Tallet og statusserne bliver.
 *   npx tsx scripts/offers-out-count-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { countOffersOut } from '../src/lib/offers/validity'
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
const rows = [
  { status: 'sent', valid_until: '2026-06-20' },
  { status: 'viewed', valid_until: '2026-06-15' },
  { status: 'sent', valid_until: '2026-06-14' },
  { status: 'sent', valid_until: null },
  { status: 'draft', valid_until: '2026-06-20' },
  { status: 'accepted', valid_until: '2026-06-20' },
]
ok(countOffersOut(rows, day) === 3, 'taelleren bliver')

const wrapped = 'className="inline-flex items-center px-2 py-1 rounded-full bg-amber-50 text-amber-900 text-sm break-words min-w-0"'
const bare = 'className="inline-flex items-center px-2 py-1 rounded-full bg-amber-50 text-amber-900 text-sm"'
const page = readFileSync('src/components/modules/offers/offers-page-client.tsx', 'utf8')
const id = 'data-testid="offers-out-count"'
const at = page.indexOf(id)
const row = at >= 0 ? page.slice(at, at + 280) : ''

ok(page.includes(wrapped), 'maerket kan krympe')
ok(page.split(wrapped).length === 2, 'maerket er et')
ok(!page.includes(bare), 'maerket er ikke bart')
ok(row.includes(wrapped), 'klassen sidder paa maerket')
ok(page.includes('Tilbud ude: {countOffersOut(offers)}'), 'tallet bliver')
ok(page.includes('OFFER_STATUS_LABELS.sent') && page.includes('OFFER_STATUS_LABELS.viewed'), 'etiketterne bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offers-out-count-wrap-test')
