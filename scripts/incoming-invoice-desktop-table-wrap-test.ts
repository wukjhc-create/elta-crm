/**
 * Tabellen paa fakturalistens skrivebord kan krympe. Kolonnerne bliver.
 *   npx tsx scripts/incoming-invoice-desktop-table-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
const wrapped = '<table className="w-full text-sm break-words min-w-0">'
const bare = '<table className="w-full text-sm">'
const desk = view.indexOf('hidden md:block')
const at = desk >= 0 ? view.indexOf(wrapped, desk) : -1
ok(view.split(wrapped).length === 2, 'tabellen kan krympe')
ok(at > desk, 'tabellen staar i skrivebordsrammen')
ok(view.split(bare).length === 1, 'den bare tabel er vaek')
ok(!view.includes(bare), 'den bare tabel er vaek')
ok(view.includes('>Leverandør</th>'), 'kolonnerne bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-table-wrap-test')
