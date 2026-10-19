/**
 * Nuværende pris på pristendensens mobilkort kan krympe. formatCurrency er uændret.
 *   npx tsx scripts/pricing-trend-price-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-price-mobile"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('tabular-nums font-medium break-words min-w-0'), 'prisen kan krympe')
ok(row.includes('{formatCurrency(trend.current_price)}'), 'beløbet er uændret')
ok(view.includes('text-right font-medium break-words min-w-0" data-testid="pricing-trend-current-desktop">{formatCurrency(trend.current_price)}'), 'skrivebordets pris bliver')
ok(view.includes('{trend.trend_30_days}%'), '30 dage bliver')
ok(view.includes('data-testid="pricing-trend-product-mobile"'), 'produktnavnet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-price-mobile-wrap-test')
