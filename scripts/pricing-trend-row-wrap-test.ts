/**
 * Pristendensens skrivebordsrække kan krympe. Prisen er uændret.
 *   npx tsx scripts/pricing-trend-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-row"')
const row = at >= 0 ? view.slice(at - 180, at + 700) : ''
ok(row.includes('min-w-0'), 'raekken kan krympe')
ok(row.includes('{trend.product_name}'), 'navnet er uændret')
ok(row.includes('text-right font-medium break-words min-w-0" data-testid="pricing-trend-current-desktop">{formatCurrency(trend.current_price)}'), 'prisen er uændret')
ok(view.split('{trend.product_name}').length - 1 === 2, 'to navne')
ok(view.includes('data-testid="pricing-trend-price-mobile"'), 'mobilprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-row-wrap-test')
