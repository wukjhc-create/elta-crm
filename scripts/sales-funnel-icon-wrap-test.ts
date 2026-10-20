/**
 * Salgstragtens ikon kan krympe. Overskriften og satserne bliver.
 *   npx tsx scripts/sales-funnel-icon-wrap-test.ts
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

const wrapped = '<TrendingUp className="w-5 h-5 text-gray-400 break-words min-w-0" />'
const bare = '<TrendingUp className="w-5 h-5 text-gray-400" />'
const table = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')

ok(table.includes(wrapped), 'ikonet kan krympe')
ok(table.split(wrapped).length === 2, 'ikonet er et')
ok(!table.includes(bare), 'ikonet er ikke bart')
ok(table.includes('<h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2 break-words min-w-0">'), 'overskriften bliver')
ok(table.includes('funnelMonthRates(m)'), 'satserne bliver')
ok(table.includes('Salgstragt'), 'teksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-icon-wrap-test')
