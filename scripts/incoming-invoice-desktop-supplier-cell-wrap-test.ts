/**
 * Leverandoercellen paa fakturalistens skrivebord kan krympe. Link og maerker bliver.
 *   npx tsx scripts/incoming-invoice-desktop-supplier-cell-wrap-test.ts
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
const wrapped = '<td className="px-3 py-2 break-words min-w-0">'
const bare = '<td className="px-3 py-2">'
const status = '<td className="px-3 py-2 break-words min-w-0"><StatusBadge row={r} /></td>'
const header = '<th className="px-3 py-2 break-words min-w-0">Leverandør</th>'
const numberCell = '<td className="px-3 py-2 font-mono text-xs break-words min-w-0">'
const cellAt = view.indexOf(wrapped)
const headerAt = view.indexOf(header)
const numberAt = view.indexOf(numberCell)
ok(view.split(wrapped).length === 3, 'leverandoercellen kan krympe')
ok(view.includes(status), 'statuscellen bliver')
ok(cellAt >= 0 && headerAt >= 0 && cellAt > headerAt, 'leverandoercellen staar under kolonnen')
ok(cellAt >= 0 && numberAt >= 0 && cellAt < numberAt, 'leverandoercellen staar foer fakturanummeret')
ok(view.split(bare).length === 1, 'den bare leverandoercelle er vaek')
ok(!view.includes(bare), 'den bare leverandoercelle er vaek')
ok(view.includes("r.supplier_name || 'Leverandør mangler'"), 'leverandoernavnet bliver')
ok(view.includes('font-medium text-emerald-700 hover:underline break-words min-w-0'), 'leverandoerlinket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-supplier-cell-wrap-test')
