/**
 * Kolonneoverskrifterne på pristendenser ombrydes. Ordene er uændret.
 *   npx tsx scripts/pricing-trend-head-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

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
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-head-wrap-test')
