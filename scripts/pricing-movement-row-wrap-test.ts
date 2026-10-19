/**
 * Prisbevægelsens række på leverandørkortet kan krympe. Procenterne er uændrede.
 *   npx tsx scripts/pricing-movement-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-movement-row"')
const row = at >= 0 ? view.slice(at - 120, at + 700) : ''
ok(row.includes('min-w-0 break-words'), 'raekken kan krympe')
ok(row.includes('>Prisbevægelse<'), 'ordet er uændret')
ok(row.includes('data-testid="pricing-movement-group"'), 'gruppen bliver')
ok(row.includes('+{stat.average_price_increase.toFixed(1)}%'), 'stigning er uændret')
ok(row.includes('-{stat.average_price_decrease.toFixed(1)}%'), 'fald er uændret')
ok(view.includes('Math.min(stat.average_price_increase * 5, 50)'), 'stigningsbjælken bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-movement-row-wrap-test')
