/**
 * Konfidenscellen paa fakturalistens skrivebord kan krympe. Confidence bliver.
 *   npx tsx scripts/incoming-invoice-desktop-confidence-wrap-test.ts
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
const wrapped = '<td className="px-3 py-2 text-right text-xs break-words min-w-0">'
const bare = '<td className="px-3 py-2 text-right text-xs">'
const mark = '<Confidence row={r} />'
const marks = view.indexOf(mark, view.indexOf('hidden md:block'))
const tdAt = marks >= 0 ? view.lastIndexOf('<td', marks) : -1
const td = tdAt >= 0 ? view.slice(tdAt, marks) : ''
ok(view.split(wrapped).length === 2, 'konfidenscellen kan krympe')
ok(td.startsWith(wrapped), 'konfidenscellen kan krympe')
ok(td.includes('break-words min-w-0'), 'konfidenscellen kan krympe')
ok(view.split(bare).length === 1, 'den bare konfidenscelle er vaek')
ok(!view.includes(bare), 'den bare konfidenscelle er vaek')
ok(view.split(mark).length === 3, 'begge konfidensmaal bliver')
ok(view.includes('function Confidence('), 'maalet bliver')
ok(view.includes('<p className="mt-2 text-xs">'), 'mobilkonfidensen bliver')

const desk = view.indexOf('hidden md:block')
ok(tdAt > desk, 'konfidenscellen staar i tabellen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-confidence-wrap-test')
