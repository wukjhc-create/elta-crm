/**
 * Mobilisten af prisadvarsler kan krympe. Navn og procent er uændrede.
 *   npx tsx scripts/pricing-alerts-list-wrap-test.ts
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
const at = view.indexOf('data-testid="price-alerts-mobile"')
const row = at >= 0 ? view.slice(at - 80, at + 1800) : ''
ok(row.includes('min-w-0'), 'listen kan krympe')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes("{isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%"), 'procenten er uændret')
ok(view.includes('<ul className="md:hidden space-y-2" data-testid="price-offers-mobile">'), 'tilbudslisten er uændret')
ok(view.includes('<ul className="md:hidden space-y-2" data-testid="price-trends-mobile">'), 'trendliste er uændret')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alerts-list-wrap-test')
