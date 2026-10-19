/**
 * Prisbevægelsens bjælke kan krympe. Bredderne er uændrede.
 *   npx tsx scripts/pricing-movement-bar-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-movement-bar"')
const row = at >= 0 ? view.slice(at - 120, at + 800) : ''
ok(row.includes('min-w-0'), 'bjaelken kan krympe')
ok(row.includes('Math.min(stat.average_price_increase * 5, 50)'), 'stigningsbredden er uændret')
ok(row.includes('Math.min(stat.average_price_decrease * 5, 50)'), 'faldsbredden er uændret')
ok(view.includes('+{stat.average_price_increase.toFixed(1)}%'), 'stigningsprocenten bliver')
ok(view.includes('-{stat.average_price_decrease.toFixed(1)}%'), 'faldsprocenten bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-movement-bar-wrap-test')
