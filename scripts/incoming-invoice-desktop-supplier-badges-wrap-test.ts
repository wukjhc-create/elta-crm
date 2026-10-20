/**
 * Maerkeraekken i leverandoercellen paa fakturalistens skrivebord kan krympe.
 * Link og maerker bliver.
 *   npx tsx scripts/incoming-invoice-desktop-supplier-badges-wrap-test.ts
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
const wrapped = '<div className="flex flex-wrap items-center gap-2 break-words min-w-0">'
const bare = '<div className="flex flex-wrap items-center gap-2 min-w-0">'
const link = '<Link href={`/dashboard/incoming-invoices/${r.id}`}'
const cell = '<td className="px-3 py-2 break-words min-w-0">'
const numberCell = '<td className="px-3 py-2 font-mono text-xs break-words min-w-0">'
const supplierRows: number[] = []
let from = 0
while (from < view.length) {
  const at = view.indexOf(wrapped, from)
  if (at < 0) break
  const after = view.slice(at + wrapped.length, at + wrapped.length + 120).replace(/^\s+/, '')
  if (after.startsWith(link)) supplierRows.push(at)
  from = at + wrapped.length
}
const rowAt = supplierRows[0] ?? -1
const cellAt = view.indexOf(cell)
const numberAt = view.indexOf(numberCell)
ok(view.split(wrapped).length === 3, 'maerkeraekken kan krympe')
ok(supplierRows.length === 1, 'kun leverandoerens maerkeraekke')
ok(rowAt >= 0 && cellAt >= 0 && rowAt > cellAt, 'maerkeraekken staar i leverandoercellen')
ok(rowAt >= 0 && numberAt >= 0 && rowAt < numberAt, 'maerkeraekken staar foer fakturanummeret')
ok(view.split(bare).length === 1, 'den bare maerkeraekke er vaek')
ok(!view.includes(bare), 'den bare maerkeraekke er vaek')
ok(view.includes('>Forfald:</span>'), 'forfaldsfilteret bliver')
ok(view.includes("r.supplier_name || 'Leverandør mangler'"), 'leverandoernavnet bliver')
ok(view.includes('<NotInvoiceBadge />'), 'ikke-faktura-maerket bliver')
ok(view.includes('<DuplicateBadge />'), 'dubletmaerket bliver')
ok(view.includes('<TestBadge />'), 'testmaerket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-supplier-badges-wrap-test')
