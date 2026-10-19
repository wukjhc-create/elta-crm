/**
 * Berørte tilbuds tabelrulle kan krympe. Nummer og beløb er uændrede.
 *   npx tsx scripts/pricing-offer-scroll-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-scroll"')
const row = at >= 0 ? view.slice(at - 80, at + 3200) : ''
ok(row.includes('overflow-x-auto min-w-0'), 'rullen kan krympe')
ok(row.includes('data-testid="pricing-offer-col-title"'), 'tilbudskolonnen bliver')
ok(row.includes('{offer.offer_number}'), 'nummeret er uændret')
ok(row.includes('text-right font-medium">{formatCurrency(offer.total_amount)}'), 'beløbet er uændret')
ok(view.split('<div className="overflow-x-auto">').length - 1 === 1, 'trendrullen bliver')
ok(view.split('{offer.offer_number}').length - 1 === 2, 'to numre')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-scroll-wrap-test')
