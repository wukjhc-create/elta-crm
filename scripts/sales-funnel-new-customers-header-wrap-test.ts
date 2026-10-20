/**
 * Kolonnen Nye kunder i salgstragten kan krympe. De andre kolonner er uændrede.
 *   npx tsx scripts/sales-funnel-new-customers-header-wrap-test.ts
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

const wrapped = '<th className="pb-2 font-medium text-gray-500 text-right break-words min-w-0">Nye kunder</th>'
const bare = '<th className="pb-2 font-medium text-gray-500 text-right">Nye kunder</th>'
const view = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')

ok(view.includes(wrapped), 'kolonnen Nye kunder kan krympe')
ok(view.split(wrapped).length === 2, 'kolonnen Nye kunder er en')
ok(!view.includes(bare), 'kolonnen Nye kunder er ikke bar')
ok(view.includes('<th className="pb-2 font-medium text-gray-500 break-words min-w-0">Måned</th>'), 'kolonnen Maaned bliver')
ok(view.includes('<th className="pb-2 font-medium text-gray-500 text-right">Tilbud oprettet</th>'), 'tilbud oprettet bliver')
ok(view.includes('<td className="py-2 text-gray-900 break-words min-w-0">{monthLabel(m.month)}'), 'maanedscellen bliver')
ok(view.includes('-15T12:00:00Z'), 'maanedens anker bliver')
ok(view.includes("timeZone: 'UTC'"), 'maanedsmatekken bliver')
ok(view.includes('formatCurrency') === false, 'tabellen opfinder ikke en pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-new-customers-header-wrap-test')
