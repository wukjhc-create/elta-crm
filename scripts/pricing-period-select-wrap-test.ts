/**
 * Periode-vælgeren på prisovervågning ombrydes. Værdierne er uændrede.
 *   npx tsx scripts/pricing-period-select-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-period-select"')
const row = at >= 0 ? view.slice(at - 120, at + 500) : ''
ok(row.includes('break-words min-w-0'), 'vaelgeren ombrydes')
ok(row.includes('value={daysBack}'), 'vaerdien er uændret')
ok(row.includes('setDaysBack(Number(e.target.value))'), 'handlingen er uændret')
ok(
  row.includes('Sidste 24 timer') &&
    row.includes('Sidste 7 dage') &&
    row.includes('Sidste 14 dage') &&
    row.includes('Sidste 30 dage'),
  'valgene er uændrede',
)
ok(view.includes('data-testid="pricing-threshold-select"'), 'taerskelvaelgeren bliver')
ok(view.includes('>2%+<') && view.includes('>5%+<') && view.includes('>10%+<') && view.includes('>20%+<'), 'taerskelvalgene bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-period-select-wrap-test')
