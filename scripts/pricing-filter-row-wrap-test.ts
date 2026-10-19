/**
 * Filterrækken på prisovervågning kan krympe. Værdierne er uændrede.
 *   npx tsx scripts/pricing-filter-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-filter-row"')
const row = at >= 0 ? view.slice(at - 180, at + 3200) : ''
ok(row.includes('flex-wrap min-w-0'), 'raekken kan krympe')
ok(row.includes('value={threshold}'), 'taerskelvaerdien er uændret')
ok(row.includes('setThreshold(Number(e.target.value))'), 'taerskel-handlingen er uændret')
ok(row.includes('>2%+<') && row.includes('>5%+<') && row.includes('>10%+<') && row.includes('>20%+<'), 'taerskelvalgene er uændrede')
ok(row.includes('value={daysBack}'), 'periodevaerdien er uændret')
ok(row.includes('setDaysBack(Number(e.target.value))'), 'periode-handlingen er uændret')
ok(row.includes('>Sidste 24 timer<') && row.includes('>Sidste 7 dage<') && row.includes('>Sidste 14 dage<') && row.includes('>Sidste 30 dage<'), 'periodevalgene er uændrede')
ok(view.includes('data-testid="pricing-trend-filter-row"'), 'trendfilteret bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-filter-row-wrap-test')
