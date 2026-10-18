/**
 * Procenterne for 30 og 90 dage på pristendenser ombrydes. Udtrykkene er uændret.
 *   npx tsx scripts/pricing-trend-percent-wrap-test.ts
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
const checks: Array<[string, string]> = [
  ['pricing-trend-30-mobile', "{trend.trend_30_days > 0 ? '+' : ''}{trend.trend_30_days}%"],
  ['pricing-trend-90-mobile', "{trend.trend_90_days > 0 ? '+' : ''}{trend.trend_90_days}%"],
  ['pricing-trend-30', "{trend.trend_30_days > 0 ? '+' : ''}{trend.trend_30_days}%"],
  ['pricing-trend-90', "{trend.trend_90_days > 0 ? '+' : ''}{trend.trend_90_days}%"],
]
for (const [id, expr] of checks) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 220, at + 400) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(expr), `${id} udtrykket er uændret`)
}
ok(view.includes('30 dage'), 'ordet 30 dage bliver')
ok(view.includes('90 dage'), 'ordet 90 dage bliver')
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-percent-wrap-test')
