/**
 * Ministatistikkens ramme kan krympe. Tallene er uændrede.
 *   npx tsx scripts/pricing-ministat-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-ministat"')
const row = at >= 0 ? view.slice(at - 80, at + 360) : ''
ok(row.includes('min-w-0'), 'rammen kan krympe')
ok(row.includes('>{value}<'), 'vaerdien kommer stadig fra value')
ok(row.includes("${warn ? 'text-amber-600' : 'text-gray-900'}"), 'advarselsfarven er uændret')
ok(view.includes('value={stat.total_products}'), 'produkttallet er uændret')
ok(view.includes('value={stat.products_with_price_changes}'), 'ændringstallet er uændret')
ok(view.includes('value={stat.stale_products}'), 'forældede tal er uændrede')
ok(view.includes('value={`${stat.average_price_increase.toFixed(1)}%`}'), 'stigningen er uændret')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-ministat-wrap-test')
