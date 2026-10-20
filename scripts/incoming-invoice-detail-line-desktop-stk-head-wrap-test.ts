/**
 * Kolonnen Stk-pris paa fakturalinjens skrivebord kan krympe.
 * Overskriften er uaendret. Stk-pris-cellen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-stk-head-wrap-test.ts
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
const wrapped = '<th className="px-2 py-1 text-right break-words min-w-0">Stk-pris</th>'
const bare = '<th className="px-2 py-1 text-right">Stk-pris</th>'
ok(view.includes(wrapped), 'stkpriskolonnen kan krympe')
ok(!view.includes(bare), 'den bare stkpriskolonne er vaek')
ok(view.split(wrapped).length === 2, 'stkpriskolonnen er en')
ok(!view.includes('break-words break-words'), 'et break-words')

const enhed = '<th className="px-2 py-1 break-words min-w-0">Enhed</th>'
ok(view.includes(enhed), 'enhedskolonnen bliver')
ok(view.split(enhed).length === 2, 'enhedskolonnen er en')

const desc = '<th className="px-2 py-1 break-words min-w-0">Beskrivelse</th>'
ok(view.includes(desc), 'beskrivelseskolonnen bliver')
ok(view.split(desc).length === 2, 'beskrivelseskolonnen er en')

const priceCell = '<td className="px-2 py-1 text-right break-words min-w-0">{fmtAmount(l.unit_price, inv.currency)}</td>'
ok(view.includes(priceCell), 'stkpriscellen bliver')
ok(view.split(priceCell).length === 2, 'stkpriscellen er en')

const total = '<th className="px-2 py-1 text-right break-words min-w-0">Total</th>'
ok(view.includes(total), 'totalkolonnen bliver')
ok(view.split(total).length === 2, 'totalkolonnen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-stk-head-wrap-test')
