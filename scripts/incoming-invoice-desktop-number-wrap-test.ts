/**
 * Fakturanummeret paa fakturalistens skrivebord kan krympe. Mobilnummeret bliver.
 *   npx tsx scripts/incoming-invoice-desktop-number-wrap-test.ts
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
const wrapped = '<td className="px-3 py-2 font-mono text-xs break-words min-w-0">{r.invoice_number ?? \'—\'}</td>'
const bare = '<td className="px-3 py-2 font-mono text-xs">{r.invoice_number ?? \'—\'}</td>'
const mobile = '<span className="font-mono text-xs text-gray-700 break-all">{r.invoice_number ?? \'—\'}</span>'
ok(view.split(wrapped).length === 2, 'skrivebordsnummeret kan krympe')
ok(view.split(bare).length === 1, 'det bare skrivebordsnummer er vaek')
ok(!view.includes(bare), 'det bare skrivebordsnummer er vaek')
ok(view.split(mobile).length === 2, 'mobilnummeret bliver')
ok(view.includes('break-all'), 'mobilnummeret kan stadig brydes')
ok(view.split("r.invoice_number ?? '—'").length === 3, 'nummeret og stregen bliver')

const desk = view.indexOf('hidden md:block')
const deskNumber = desk >= 0 ? view.indexOf(wrapped, desk) : -1
ok(deskNumber > desk, 'skrivebordsnummeret staar i tabellen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-number-wrap-test')
