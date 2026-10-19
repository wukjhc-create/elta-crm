/**
 * Mobilisten af berørte tilbud kan krympe. Nummer og beløb er uændrede.
 *   npx tsx scripts/pricing-offers-list-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="price-offers-mobile"')
const row = at >= 0 ? view.slice(at - 80, at + 1400) : ''
ok(row.includes('min-w-0'), 'listen kan krympe')
ok(row.includes('href={`/dashboard/offers/${offer.offer_id}`}'), 'linket er uændret')
ok(row.includes('{offer.offer_number}'), 'nummeret er uændret')
ok(row.includes('{formatCurrency(offer.total_amount)}'), 'beløbet er uændret')
ok(view.includes('text-right font-medium">{formatCurrency(offer.total_amount)}'), 'skrivebordets beløb bliver')
ok(view.includes('<ul className="md:hidden space-y-2 min-w-0" data-testid="price-trends-mobile">'), 'trendliste kan krympe')
ok(view.split('{offer.offer_number}').length - 1 === 2, 'to numre')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offers-list-wrap-test')
