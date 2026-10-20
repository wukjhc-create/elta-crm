/**
 * Linjekortet paa fakturalinjens mobilvisning kan krympe.
 * Indholdet er uaendret. Konverteringen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-card-wrap-test.ts
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
const wrapped = '<article key={l.id} className="rounded ring-1 ring-gray-200 p-2 text-xs break-words min-w-0">'
const bare = '<article key={l.id} className="rounded ring-1 ring-gray-200 p-2 text-xs">'
ok(view.includes(wrapped), 'kortet kan krympe')
ok(!view.includes(bare), 'det bare kort er vaek')
ok(view.split(wrapped).length === 2, 'kortet er et')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('key={l.id}'), 'noeglen bliver')

const conv = 'className="mt-1 text-gray-700 break-words min-w-0"'
ok(view.includes(conv), 'konverteringen bliver')
ok(view.split(conv).length === 2, 'konverteringen er en')

const desc = '<p className="font-medium text-gray-900 break-words">{l.line_number}. {l.description ?? \'—\'}</p>'
ok(view.includes(desc), 'beskrivelsen bliver')
ok(view.split(desc).length === 2, 'beskrivelsen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-card-wrap-test')
