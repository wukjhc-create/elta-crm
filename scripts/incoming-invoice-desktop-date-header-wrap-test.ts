/**
 * Kolonnen Faktura dato paa fakturalistens skrivebord kan krympe. Teksten bliver.
 *   npx tsx scripts/incoming-invoice-desktop-date-header-wrap-test.ts
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
const wrapped = '<th className="px-3 py-2 break-words min-w-0">Faktura dato</th>'
const bare = '<th className="px-3 py-2">Faktura dato</th>'
const desk = view.indexOf('hidden md:block')
const thAt = desk >= 0 ? view.indexOf(wrapped, desk) : -1
ok(view.split(wrapped).length === 2, 'kolonnen faktura dato kan krympe')
ok(thAt > desk, 'kolonnen faktura dato staar i tabellen')
ok(view.split(bare).length === 1, 'den bare faktura dato-kolonne er vaek')
ok(!view.includes(bare), 'den bare faktura dato-kolonne er vaek')
ok(view.includes('>Faktura dato</th>'), 'teksten faktura dato bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-date-header-wrap-test')
