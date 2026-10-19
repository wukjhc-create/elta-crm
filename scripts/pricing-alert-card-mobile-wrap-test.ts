/**
 * Prisadvarslens mobilkort kan krympe. Navn og procent er uændrede.
 *   npx tsx scripts/pricing-alert-card-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-card-mobile"')
const row = at >= 0 ? view.slice(at - 160, at + 1600) : ''
ok(row.includes('min-w-0'), 'kortet kan krympe')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes("{isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%"), 'procenten er uændret')
ok(row.includes('formatCurrency(alert.old_price)'), 'gammel pris er uændret')
ok(view.includes('<li key={offer.offer_id} className="rounded-lg ring-1 ring-gray-200 bg-white p-3 text-sm min-w-0" data-testid="pricing-offer-card-mobile">'), 'tilbudskortet kan krympe')
ok(view.includes('<li key={trend.supplier_product_id} className="rounded-lg ring-1 ring-gray-200 bg-white p-3 text-sm min-w-0" data-testid="pricing-trend-card-mobile">'), 'trendkortet kan krympe')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-card-mobile-wrap-test')
