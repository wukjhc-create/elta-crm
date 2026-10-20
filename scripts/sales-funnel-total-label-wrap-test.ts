/**
 * Totaloverskriften i salgstragtens mobilkort kan krympe. Beloeb og satser bliver.
 *   npx tsx scripts/sales-funnel-total-label-wrap-test.ts
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
ok(rates.sent_rate === 50, 'sendt-satsen bliver')
ok(rates.win_rate === 50, 'vinder-satsen bliver')

const wrapped = '<p className="font-semibold break-words min-w-0">I alt</p>'
const bare = '<p className="font-semibold">I alt</p>'
const table = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')

ok(table.includes(wrapped), 'totaloverskriften kan krympe')
ok(table.split(wrapped).length === 2, 'totaloverskriften er en')
ok(!table.includes(bare), 'totaloverskriften er ikke bar')
ok(table.includes('kr(t.accepted_value)'), 'beloebet bliver')
ok(table.includes('data-testid="funnel-month-rates"'), 'satserne bliver')
ok(table.includes('<td className="py-2 break-words min-w-0">I alt</td>'), 'skrivebordets total bliver')
ok(!table.includes('<td className="py-2">I alt</td>'), 'skrivebordets total er ikke bar')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-total-label-wrap-test')
