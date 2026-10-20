/**
 * Beskrivelsescellen paa fakturalinjens skrivebord kan krympe.
 * Beskrivelsen er uaendret. Skrivebordstotalen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-description-wrap-test.ts
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
const wrapped = '<td className="px-2 py-1 break-words min-w-0">{l.description ?? \'—\'}</td>'
const bare = '<td className="px-2 py-1">{l.description ?? \'—\'}</td>'
ok(view.includes(wrapped), 'beskrivelsescellen kan krympe')
ok(!view.includes(bare), 'den bare beskrivelsescellen er vaek')
ok(view.split(wrapped).length === 2, 'beskrivelsescellen er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes("{l.description ?? '—'}"), 'beskrivelsesteksten bliver')

const total = '<td className="px-2 py-1 text-right font-medium break-words min-w-0">{fmtAmount(l.total_price, inv.currency)}</td>'
ok(view.includes(total), 'skrivebordstotalen bliver')
ok(view.split(total).length === 2, 'skrivebordstotalen er en')

const unit = '<td className="px-2 py-1 text-right">{fmtAmount(l.unit_price, inv.currency)}</td>'
ok(view.includes(unit), 'stykpriscellen bliver')
ok(view.split(unit).length === 2, 'stykpriscellen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-description-wrap-test')
