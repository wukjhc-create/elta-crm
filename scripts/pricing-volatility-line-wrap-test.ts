/**
 * Volatilitets-linjen på pristendensens mobilkort ombrydes.
 * Etiketterne og procenterne er uændrede.
 *   npx tsx scripts/pricing-volatility-line-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-volatility-line-mobile"')
const row = at >= 0 ? view.slice(at - 40, at + 560) : ''
ok(row.includes('break-words min-w-0'), 'linjen ombrydes')
ok(row.includes('{volatilityLabels[trend.volatility]}'), 'etiketten er uændret')
ok(row.includes('{trend.change_count_30_days} ændringer'), 'ændringerne er uændrede')
ok(view.includes('{trend.trend_30_days}%'), '30-dages procenten bliver')
ok(view.includes('{trend.trend_90_days}%'), '90-dages procenten bliver')
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-volatility-line-wrap-test')
