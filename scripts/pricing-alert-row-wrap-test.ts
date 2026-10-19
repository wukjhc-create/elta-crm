/**
 * Prisadvarslens skrivebordsrække kan krympe. Priserne er uændrede.
 *   npx tsx scripts/pricing-alert-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-row"')
const row = at >= 0 ? view.slice(at - 160, at + 2200) : ''
ok(row.includes('min-w-0'), 'raekken kan krympe')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes('text-right text-gray-500">{formatCurrency(alert.old_price)}'), 'gammel pris er uændret')
ok(row.includes('text-right font-medium">{formatCurrency(alert.new_price)}'), 'ny pris er uændret')
ok(row.includes("{isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%"), 'procenten er uændret')
ok(view.includes('<tr key={offer.offer_id} className="border-b last:border-0 hover:bg-gray-50 min-w-0" data-testid="pricing-offer-row">'), 'tilbudsraekken kan krympe')
ok(view.includes('<tr key={trend.supplier_product_id} className="border-b last:border-0 hover:bg-gray-50 min-w-0" data-testid="pricing-trend-row">'), 'trendraekken kan krympe')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-row-wrap-test')
