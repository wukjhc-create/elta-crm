/**
 * Totalcellen paa fakturalinjens skrivebord kan krympe.
 * Belobet er uaendret. Stykprisen paa mobilkortet er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-total-wrap-test.ts
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
const wrapped = '<td className="px-2 py-1 text-right font-medium break-words min-w-0">{fmtAmount(l.total_price, inv.currency)}</td>'
const bare = '<td className="px-2 py-1 text-right font-medium">{fmtAmount(l.total_price, inv.currency)}</td>'
ok(view.includes(wrapped), 'skrivebordstotalen kan krympe')
ok(!view.includes(bare), 'den bare skrivebordstotal er vaek')
ok(view.split(wrapped).length === 2, 'skrivebordstotalen er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('fmtAmount(l.total_price, inv.currency)'), 'totalbelobet bliver')

const unit = '<p className="break-words min-w-0">Stk-pris {fmtAmount(l.unit_price, inv.currency)}</p>'
ok(view.includes(unit), 'stykprisen bliver')
ok(view.split(unit).length === 2, 'stykprisen er en')

const desc = '<td className="px-2 py-1">{l.description ?? \'—\'}</td>'
ok(view.includes(desc), 'beskrivelsescellen bliver')
ok(view.split(desc).length === 2, 'beskrivelsescellen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-total-wrap-test')
