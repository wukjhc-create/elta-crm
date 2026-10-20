/**
 * Totalkortet i salgstragten kan krympe. Beloeb og satser bliver.
 *   npx tsx scripts/sales-funnel-total-card-wrap-test.ts
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

const wrapped = '<article className="rounded bg-gray-50 ring-1 ring-gray-200 p-3 text-sm break-words min-w-0">'
const bare = '<article className="rounded bg-gray-50 ring-1 ring-gray-200 p-3 text-sm">'
const month = '<article key={m.month} className="rounded ring-1 ring-gray-200 p-3 text-sm break-words min-w-0">'
const table = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')

ok(table.includes(wrapped), 'totalkortet kan krympe')
ok(table.split(wrapped).length === 2, 'totalkortet er et')
ok(!table.includes(bare), 'totalkortet er ikke bart')
ok(table.includes(month), 'maanedskortet bliver')
ok(table.includes('kr(t.accepted_value)'), 'beloebet bliver')
ok(table.includes('data-testid="funnel-month-rates"'), 'satserne bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-total-card-wrap-test')
