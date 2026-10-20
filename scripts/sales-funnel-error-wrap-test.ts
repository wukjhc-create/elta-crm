/**
 * Fejlteksten i salgstragten kan krympe. Teksten er uændret.
 *   npx tsx scripts/sales-funnel-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { funnelMonthRates } from '../src/lib/reports/sales-funnel'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')
const rates = funnelMonthRates({ offers_created: 4, offers_sent: 2, offers_accepted: 1 })
ok(rates.sent_rate === 50 && rates.win_rate === 50, 'satserne bliver')

const wrapped = 'className="text-sm text-red-700 bg-white rounded-lg border p-4 break-words min-w-0"'
const bare = 'className="text-sm text-red-700 bg-white rounded-lg border p-4"'
const text = 'Kunne ikke hente salgstragten. De andre tal på siden er uændrede.'
const view = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')

ok(view.includes(wrapped), 'fejlteksten kan krympe')
ok(view.split(wrapped).length === 2, 'fejlteksten er en')
ok(!view.includes(bare), 'fejlteksten er ikke bar')
ok(view.includes(text), 'teksten bliver')
ok(view.includes('data-testid="report-sales-funnel"'), 'rammen bliver')
ok(view.includes('formatCurrency') === false, 'tabellen opfinder ikke en pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-error-wrap-test')
