/**
 * Konverteringen paa fakturalinjens mobilkort kan krympe.
 * Teksten er uaendret. Totalen og antallet er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-line-conversion-wrap-test.ts
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
const wrapped = 'className="mt-1 text-gray-700 break-words min-w-0"'
const bare = 'className="mt-1 text-gray-700"'
ok(view.includes(wrapped), 'konverteringen kan krympe')
ok(!view.includes(bare), 'den bare konvertering er vaek')
ok(view.split(wrapped).length === 2, 'konverteringen er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes("convertedAs === 'material' ? 'Materiale'"), 'materiale bliver')
ok(view.includes("convertedAs === 'other_cost' ? 'Øvrig'"), 'ovrig bliver')
ok(view.includes("skippedExplicit ? 'Sprunget over'"), 'sprunget over bliver')
ok(view.includes("'Ikke konverteret'"), 'ikke konverteret bliver')

const total = '<p className="font-medium break-words min-w-0">Total {fmtAmount(l.total_price, inv.currency)}</p>'
ok(view.includes(total), 'totalen bliver')
ok(view.split(total).length === 2, 'totalen er en')

const qty = '<p className="text-gray-600 mt-1 break-words min-w-0">{l.quantity ?? \'—\'} {l.unit ?? \'\'}</p>'
ok(view.includes(qty), 'antallet bliver')
ok(view.split(qty).length === 2, 'antallet er et')

const card = '<article key={l.id} className="rounded ring-1 ring-gray-200 p-2 text-xs">'
ok(view.includes(card), 'kortet bliver')
ok(view.split(card).length === 2, 'kortet er et')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-conversion-wrap-test')
