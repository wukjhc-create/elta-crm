/**
 * Kolonneoverskrifterne på pristendenser ombrydes. Ordene er uændret.
 *   npx tsx scripts/pricing-trend-head-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')
ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const words: Array<[string, string]> = [
  ['pricing-trend-col-product', '>Produkt<'],
  ['pricing-trend-col-current', '>Nuv. pris<'],
  ['pricing-trend-col-d30', '>30 dage<'],
  ['pricing-trend-col-d90', '>90 dage<'],
  ['pricing-trend-col-volatility', '>Volatilitet<'],
  ['pricing-trend-col-changes', '>Ændringer<'],
]
for (const [id, word] of words) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 90, at + 70) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(word), `${word} er uændret`)
}
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(view.includes('data-testid="pricing-alert-col-product"'), 'advarselsoverskriften bliver')
const head = view.indexOf('data-testid="pricing-trend-head"')
const block = head >= 0 ? view.slice(head - 80, head + 2800) : ''
ok(block.includes('bg-gray-50 min-w-0'), 'rækken kan krympe')
ok(block.includes('data-testid="pricing-trend-col-product"'), 'produktkolonnen bliver')
ok(block.includes('{trend.product_name}'), 'navnet er uændret')
ok(block.includes('text-right font-medium break-words min-w-0" data-testid="pricing-trend-current-desktop">{formatCurrency(trend.current_price)}'), 'prisen er uændret')
ok(view.split('<tr className="border-b bg-gray-50">').length - 1 === 0, 'ingen upakket kolonnerække')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-head-wrap-test')
