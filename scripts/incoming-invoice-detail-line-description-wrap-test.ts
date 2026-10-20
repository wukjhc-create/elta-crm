/**
 * Beskrivelsen paa fakturalinjens mobilkort kan krympe.
 * Beskrivelsen er uaendret. Kun min-w-0 er tilfoejet.
 *   npx tsx scripts/incoming-invoice-detail-line-description-wrap-test.ts
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
const wrapped = '<p className="font-medium text-gray-900 break-words min-w-0">{l.line_number}. {l.description ?? \'—\'}</p>'
const bare = '<p className="font-medium text-gray-900 break-words">{l.line_number}. {l.description ?? \'—\'}</p>'
ok(view.includes(wrapped), 'beskrivelsen kan krympe')
ok(!view.includes(bare), 'den bare beskrivelse er vaek')
ok(view.split(wrapped).length === 2, 'beskrivelsen er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('{l.line_number}'), 'linjenummeret bliver')
ok(view.includes("{l.description ?? '—'}"), 'beskrivelsesteksten bliver')

const card = '<article key={l.id} className="rounded ring-1 ring-gray-200 p-2 text-xs break-words min-w-0">'
ok(view.includes(card), 'kortet bliver')
ok(view.split(card).length === 2, 'kortet er et')

const unit = '<p>Stk-pris {fmtAmount(l.unit_price, inv.currency)}</p>'
ok(view.includes(unit), 'stykprisen bliver')
ok(view.split(unit).length === 2, 'stykprisen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-description-wrap-test')
