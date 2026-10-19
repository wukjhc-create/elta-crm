/**
 * 90-dages-cellen på pristendensens skrivebord ombrydes. Procenten er uændret.
 *   npx tsx scripts/pricing-trend-90-cell-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-90-cell"')
const row = at >= 0 ? view.slice(at - 40, at + 900) : ''
ok(row.includes('break-words min-w-0'), 'cellen ombrydes')
ok(row.includes("{trend.trend_90_days > 0 ? '+' : ''}{trend.trend_90_days}%"), 'procenten er uændret')
ok(row.includes('data-testid="pricing-trend-90"'), 'maerket bliver')
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(view.includes('{trend.trend_30_days}%'), '30-dages procenten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-90-cell-wrap-test')
