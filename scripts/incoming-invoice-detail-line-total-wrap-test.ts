/**
 * Totalen paa fakturalinjens mobilkort kan krympe.
 * Totalen er uaendret. Konverteringen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-total-wrap-test.ts
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
const wrapped = '<p className="font-medium break-words min-w-0">Total {fmtAmount(l.total_price, inv.currency)}</p>'
const bare = '<p className="font-medium">Total {fmtAmount(l.total_price, inv.currency)}</p>'
ok(view.includes(wrapped), 'totalen kan krympe')
ok(!view.includes(bare), 'den bare total er vaek')
ok(view.split(wrapped).length === 2, 'totalen er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('fmtAmount(l.total_price, inv.currency)'), 'totalbelobet bliver')

const conv = 'className="mt-1 text-gray-700"'
ok(view.includes(conv), 'konverteringen bliver')
ok(view.split(conv).length === 2, 'konverteringen er en')

const qty = '<p className="text-gray-600 mt-1 break-words min-w-0">{l.quantity ?? \'—\'} {l.unit ?? \'\'}</p>'
ok(view.includes(qty), 'antallet bliver')
ok(view.split(qty).length === 2, 'antallet er et')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-total-wrap-test')
