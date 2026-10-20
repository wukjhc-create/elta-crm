/**
 * Totalen for accepteret værdi i salgstragtens skrivebord kan krympe. Beløbet er uændret.
 *   npx tsx scripts/sales-funnel-total-accepted-value-cell-wrap-test.ts
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

const wrapped = '<td className="py-2 text-right tabular-nums break-words min-w-0">{kr(t.accepted_value)}</td>'
const bare = '<td className="py-2 text-right tabular-nums">{kr(t.accepted_value)}</td>'
const view = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')

ok(view.includes(wrapped), 'totalen for accepteret vaerdi kan krympe')
ok(view.split(wrapped).length === 2, 'totalen for accepteret vaerdi er en')
ok(!view.includes(bare), 'totalen for accepteret vaerdi er ikke bar')
ok(view.includes('<td className="py-2 text-right tabular-nums break-words min-w-0">{t.offers_accepted}</td>'), 'totalen for accepterede tilbud bliver')
ok(view.includes("{m.accepted_value ? kr(m.accepted_value) : '—'}"), 'maanedens beloeb bliver')
ok(view.includes('Accepteret værdi {kr(t.accepted_value)}'), 'mobilens beloeb bliver')
ok(view.includes('-15T12:00:00Z'), 'maanedens anker bliver')
ok(view.includes("timeZone: 'UTC'"), 'maanedsmatekken bliver')
ok(view.includes('formatCurrency') === false, 'tabellen opfinder ikke en pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-total-accepted-value-cell-wrap-test')
