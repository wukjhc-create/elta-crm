/**
 * Tilbudscellen på berørte tilbud ombrydes. Nummeret er uændret.
 *   npx tsx scripts/pricing-offer-number-cell-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-number-cell"')
const row = at >= 0 ? view.slice(at - 80, at + 420) : ''
ok(row.includes('break-words min-w-0'), 'cellen ombrydes')
ok(row.includes('{offer.offer_number}'), 'nummeret er uændret')
ok(row.includes('href={`/dashboard/offers/${offer.offer_id}`}'), 'linket er uændret')
ok(row.includes('data-testid="pricing-offer-number"'), 'nummer-maerket bliver')
ok(view.includes('break-words max-w-[16rem]">{offer.offer_title}'), 'titlen bliver')
ok(view.includes('formatCurrency(offer.total_amount)'), 'tilbudsbeløbet bliver')
ok(view.split('{offer.offer_number}').length - 1 === 2, 'to numre')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-number-cell-wrap-test')
