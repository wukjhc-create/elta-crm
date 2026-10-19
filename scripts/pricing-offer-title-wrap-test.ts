/**
 * Tilbudstitlen på berørte tilbud kan krympe. Titlen er uændret.
 *   npx tsx scripts/pricing-offer-title-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-title"')
const row = at >= 0 ? view.slice(at - 90, at + 80) : ''
ok(row.includes('break-words max-w-[16rem] min-w-0'), 'titlen kan krympe')
ok(row.includes('{offer.offer_title}'), 'titlen er uændret')
ok(view.includes('text-xs text-gray-600 break-words min-w-0" data-testid="pricing-offer-title-mobile">{offer.offer_title}'), 'mobil-titlen bliver')
ok(view.includes('{offer.offer_number}'), 'nummeret bliver')
ok(view.includes('formatCurrency(offer.total_amount)'), 'tilbudsbeløbet bliver')
ok(view.split('{offer.offer_title}').length - 1 === 2, 'to titler')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-title-wrap-test')
