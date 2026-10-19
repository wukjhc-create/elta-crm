/**
 * Volatilitets-cellen på pristendensens skrivebord ombrydes. Etiketten er uændret.
 *   npx tsx scripts/pricing-trend-volatility-cell-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-volatility-cell"')
const row = at >= 0 ? view.slice(at - 40, at + 400) : ''
ok(row.includes('break-words min-w-0'), 'cellen ombrydes')
ok(row.includes('{volatilityLabels[trend.volatility]}'), 'etiketten er uændret')
ok(view.includes("stable: 'Stabil'"), 'Stabil bliver')
ok(view.includes("moderate: 'Moderat'"), 'Moderat bliver')
ok(view.includes("high: 'Høj'"), 'Høj bliver')
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-volatility-cell-wrap-test')
