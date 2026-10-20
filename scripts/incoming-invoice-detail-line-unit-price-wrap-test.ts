/**
 * Stykprisen paa fakturalinjens mobilkort kan krympe.
 * Belobet er uaendret. Beskrivelsen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-unit-price-wrap-test.ts
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
const wrapped = '<p className="break-words min-w-0">Stk-pris {fmtAmount(l.unit_price, inv.currency)}</p>'
const bare = '<p>Stk-pris {fmtAmount(l.unit_price, inv.currency)}</p>'
ok(view.includes(wrapped), 'stykprisen kan krympe')
ok(!view.includes(bare), 'den bare stykpris er vaek')
ok(view.split(wrapped).length === 2, 'stykprisen er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('Stk-pris {fmtAmount(l.unit_price, inv.currency)}'), 'stykprisbelobet bliver')

const desc = '<p className="font-medium text-gray-900 break-words min-w-0">{l.line_number}. {l.description ?? \'—\'}</p>'
ok(view.includes(desc), 'beskrivelsen bliver')
ok(view.split(desc).length === 2, 'beskrivelsen er en')

const desktop = '<td className="px-2 py-1 text-right font-medium">{fmtAmount(l.total_price, inv.currency)}</td>'
ok(view.includes(desktop), 'skrivebordstotalen bliver')
ok(view.split(desktop).length === 2, 'skrivebordstotalen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-unit-price-wrap-test')
