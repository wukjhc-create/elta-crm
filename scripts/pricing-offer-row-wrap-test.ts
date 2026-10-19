/**
 * Berørte tilbuds skrivebordsrække kan krympe. Beløbet er uændret.
 *   npx tsx scripts/pricing-offer-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-row"')
const row = at >= 0 ? view.slice(at - 140, at + 1800) : ''
ok(row.includes('min-w-0'), 'raekken kan krympe')
ok(row.includes('href={`/dashboard/offers/${offer.offer_id}`}'), 'linket er uændret')
ok(row.includes('{offer.offer_number}'), 'nummeret er uændret')
ok(row.includes('text-right font-medium">{formatCurrency(offer.total_amount)}'), 'beløbet er uændret')
ok(view.includes('<tr key={trend.supplier_product_id} className="border-b last:border-0 hover:bg-gray-50">'), 'trendraekken er uændret')
ok(view.split('{offer.offer_number}').length - 1 === 2, 'to numre')
ok(view.includes('formatCurrency(Math.abs(offer.potential_loss))'), 'tabet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-row-wrap-test')
