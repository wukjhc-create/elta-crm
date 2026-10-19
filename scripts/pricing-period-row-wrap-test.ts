/**
 * Perioderækken på prisovervågning kan krympe. Periodeværdierne er uændrede.
 *   npx tsx scripts/pricing-period-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-period-row"')
const row = at >= 0 ? view.slice(at - 120, at + 1100) : ''
ok(row.includes('min-w-0'), 'raekken kan krympe')
ok(row.includes('>Periode:<'), 'etiketten er uændret')
ok(row.includes('value={daysBack}'), 'vaerdien er uændret')
ok(row.includes('setDaysBack(Number(e.target.value))'), 'handlingen er uændret')
ok(row.includes('>Sidste 24 timer<') && row.includes('>Sidste 7 dage<') && row.includes('>Sidste 14 dage<') && row.includes('>Sidste 30 dage<'), 'valgene er uændrede')
ok(view.includes('value={threshold}'), 'taerskelvaerdien bliver')
ok(view.includes('data-testid="pricing-threshold-row"'), 'taerskelraekken bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-period-row-wrap-test')
