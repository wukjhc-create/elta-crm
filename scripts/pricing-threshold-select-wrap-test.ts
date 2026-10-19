/**
 * Tærskel-vælgeren på prisovervågning ombrydes. Værdierne er uændrede.
 *   npx tsx scripts/pricing-threshold-select-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-threshold-select"')
const row = at >= 0 ? view.slice(at - 80, at + 420) : ''
ok(row.includes('break-words min-w-0'), 'vaelgeren ombrydes')
ok(row.includes('value={threshold}'), 'vaerdien er uændret')
ok(row.includes('setThreshold(Number(e.target.value))'), 'handlingen er uændret')
ok(row.includes('>2%+<') && row.includes('>5%+<') && row.includes('>10%+<') && row.includes('>20%+<'), 'valgene er uændrede')
ok(view.includes('value={daysBack}'), 'periodevaelgeren bliver')
ok(view.includes('className="border rounded px-2 py-1 text-sm"'), 'periodeklassen bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-threshold-select-wrap-test')
