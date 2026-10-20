/**
 * Kolonnen Total paa fakturalinjens skrivebord kan krympe.
 * Overskriften er uaendret. Totalcellen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-total-head-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const wrapped = '<th className="px-2 py-1 text-right break-words min-w-0">Total</th>'
const bare = '<th className="px-2 py-1 text-right">Total</th>'
ok(view.includes(wrapped), 'totalkolonnen kan krympe')
ok(!view.includes(bare), 'den bare totalkolonne er vaek')
ok(view.split(wrapped).length === 2, 'totalkolonnen er en')
ok(!view.includes('break-words break-words'), 'et break-words')

const stk = '<th className="px-2 py-1 text-right break-words min-w-0">Stk-pris</th>'
ok(view.includes(stk), 'stkpriskolonnen bliver')
ok(view.split(stk).length === 2, 'stkpriskolonnen er en')

const enhed = '<th className="px-2 py-1 break-words min-w-0">Enhed</th>'
ok(view.includes(enhed), 'enhedskolonnen bliver')
ok(view.split(enhed).length === 2, 'enhedskolonnen er en')

const totalCell = '<td className="px-2 py-1 text-right font-medium break-words min-w-0">{fmtAmount(l.total_price, inv.currency)}</td>'
ok(view.includes(totalCell), 'totalcellen bliver')
ok(view.split(totalCell).length === 2, 'totalcellen er en')

const conv = '<th className="px-2 py-1 break-words min-w-0">Konvertering</th>'
ok(view.includes(conv), 'konverteringskolonnen bliver')
ok(view.split(conv).length === 2, 'konverteringskolonnen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-total-head-wrap-test')
