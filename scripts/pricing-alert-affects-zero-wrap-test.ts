/**
 * Nul-mærket på prisadvarslens påvirkning ombrydes. Bindestregen er uændret.
 *   npx tsx scripts/pricing-alert-affects-zero-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-affects-zero"')
const row = at >= 0 ? view.slice(at - 220, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'maerket ombrydes')
ok(row.includes('>-<'), 'bindestregen er uændret')
ok(row.includes('alert.affects_offers === 0 && alert.affects_calculations === 0'), 'nul-betingelsen bliver')
ok(view.includes('{alert.affects_offers}'), 'tilbudstallet bliver')
ok(view.includes('{alert.affects_calculations}'), 'kalkulationstallet bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(view.includes('data-testid="pricing-trend-30-missing"'), 'trendstregen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-affects-zero-wrap-test')
