/**
 * Enhedscellen paa fakturalinjens skrivebord kan krympe.
 * Enheden er uaendret. Antalcellen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-unit-wrap-test.ts
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
const wrapped = '<td className="px-2 py-1 break-words min-w-0">{l.unit ?? \'—\'}</td>'
const bare = '<td className="px-2 py-1">{l.unit ?? \'—\'}</td>'
ok(view.includes(wrapped), 'enhedscellen kan krympe')
ok(!view.includes(bare), 'den bare enhedscelle er vaek')
ok(view.split(wrapped).length === 2, 'enhedscellen er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes("{l.unit ?? '—'}"), 'enheden bliver')

const qty = '<td className="px-2 py-1 text-right break-words min-w-0">{l.quantity ?? \'—\'}</td>'
ok(view.includes(qty), 'antalcellen bliver')
ok(view.split(qty).length === 2, 'antalcellen er en')

const desc = '<td className="px-2 py-1 break-words min-w-0">{l.description ?? \'—\'}</td>'
ok(view.includes(desc), 'beskrivelsescellen bliver')
ok(view.split(desc).length === 2, 'beskrivelsescellen er en')

const num = '<td className="px-2 py-1">{l.line_number}</td>'
ok(view.includes(num), 'linjenummercellen bliver')
ok(view.split(num).length === 2, 'linjenummercellen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-unit-wrap-test')
