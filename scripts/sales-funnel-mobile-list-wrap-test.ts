/**
 * Mobilisten i salgstragten kan krympe. Kortene er uændrede.
 *   npx tsx scripts/sales-funnel-mobile-list-wrap-test.ts
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

const wrapped = '<div className="md:hidden space-y-2 break-words min-w-0" data-testid="sales-funnel-mobile">'
const bare = '<div className="md:hidden space-y-2" data-testid="sales-funnel-mobile">'
const table = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')

ok(table.includes(wrapped), 'mobilisten kan krympe')
ok(table.split(wrapped).length === 2, 'mobilisten er en')
ok(!table.includes(bare), 'mobilisten er ikke bar')
ok(table.includes('<article key={m.month} className="rounded ring-1 ring-gray-200 p-3 text-sm break-words min-w-0">'), 'maanedskortet bliver')
ok(table.includes('kr(m.accepted_value)'), 'beloebet bliver')
ok(table.includes('data-testid="funnel-month-rates"'), 'satserne bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-mobile-list-wrap-test')
