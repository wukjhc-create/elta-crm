/**
 * Statuscellen paa fakturalistens skrivebord kan krympe. StatusBadge bliver.
 *   npx tsx scripts/incoming-invoice-desktop-status-wrap-test.ts
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
const wrapped = '<td className="px-3 py-2 break-words min-w-0"><StatusBadge row={r} /></td>'
const bare = '<td className="px-3 py-2"><StatusBadge row={r} /></td>'
const badge = '<StatusBadge row={r} />'
ok(view.split(wrapped).length === 2, 'statuscellen kan krympe')
ok(view.split(bare).length === 1, 'den bare statuscelle er vaek')
ok(!view.includes(bare), 'den bare statuscelle er vaek')
ok(view.split(badge).length === 3, 'begge maerker bliver')
ok(view.includes('function StatusBadge('), 'maerket bliver')

const desk = view.indexOf('hidden md:block')
const cell = desk >= 0 ? view.indexOf(wrapped, desk) : -1
ok(cell > desk, 'statuscellen staar i tabellen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-status-wrap-test')
