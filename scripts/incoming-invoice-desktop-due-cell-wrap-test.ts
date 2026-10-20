/**
 * Forfaldscellen paa fakturalistens skrivebord kan krympe. DueMarks bliver.
 *   npx tsx scripts/incoming-invoice-desktop-due-cell-wrap-test.ts
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
const wrapped = '<td className="px-3 py-2 text-xs break-words min-w-0">'
const bare = '<td className="px-3 py-2 text-xs">'
const dateCell = '<td className="px-3 py-2 text-xs break-words min-w-0">{fmtDate(r.invoice_date)}</td>'
const desktopMarks = '<DueMarks dueDate={r.due_date} todayIso={todayIso} />'
const mobileMarks = '<DueMarks dueDate={r.due_date} todayIso={todayIso} withLabel />'
const marksAt = view.indexOf(desktopMarks)
const tdAt = marksAt >= 0 ? view.lastIndexOf('<td', marksAt) : -1
const td = tdAt >= 0 ? view.slice(tdAt, marksAt) : ''
ok(td.startsWith(wrapped), 'forfaldscellen kan krympe')
ok(td.includes('break-words min-w-0'), 'forfaldscellen kan krympe')
ok(!td.includes('fmtDate'), 'det er ikke fakturadatoen')
ok(view.split(bare).length === 1, 'den bare forfaldscelle er vaek')
ok(!view.includes(bare), 'den bare forfaldscelle er vaek')
ok(view.split(desktopMarks).length === 2, 'skrivebordets markering bliver')
ok(view.split(mobileMarks).length === 2, 'mobilens etiket bliver')
ok(view.split(dateCell).length === 2, 'fakturadatoen kan stadig krympe')

const desk = view.indexOf('hidden md:block')
ok(tdAt > desk, 'forfaldscellen staar i tabellen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-due-cell-wrap-test')
