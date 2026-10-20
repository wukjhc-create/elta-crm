/**
 * Maanedens satser i salgstragtens mobilkort kan krympe. Skrivebordets satslinje har ogsaa min-w-0.
 *   npx tsx scripts/sales-funnel-month-rates-wrap-test.ts
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

const wrapped = '<p className="text-xs text-gray-600 break-words min-w-0" data-testid="funnel-month-rates">'
const bare = '<p className="text-xs text-gray-600 break-words" data-testid="funnel-month-rates">'
const view = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')

ok(view.includes(wrapped), 'mobilens satser kan krympe')
ok(view.split(wrapped).length === 2, 'mobilens satser er en')
ok(!view.includes(bare), 'mobilens satser er ikke bare')
ok(view.includes('className="text-[11px] font-normal text-gray-600 break-words min-w-0" data-testid="funnel-month-rates"'), 'skrivebordets satser kan krympe')
ok(!view.includes('className="text-[11px] font-normal text-gray-600 break-words" data-testid="funnel-month-rates"'), 'skrivebordets satser er ikke bare')
ok(view.includes('-15T12:00:00Z'), 'maanedens anker bliver')
ok(view.includes("timeZone: 'UTC'"), 'maanedsmatekken bliver')
ok(view.includes('formatCurrency') === false, 'tabellen opfinder ikke en pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-month-rates-wrap-test')
