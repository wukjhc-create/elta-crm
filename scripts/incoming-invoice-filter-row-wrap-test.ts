/**
 * Filterraekken paa fakturalisten kan krympe. Knapperne bliver.
 *   npx tsx scripts/incoming-invoice-filter-row-wrap-test.ts
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
const wrapped = '<div className="flex flex-wrap gap-2 break-words min-w-0">'
const bare = '<div className="flex flex-wrap gap-2">'
const list = 'data-testid="incoming-invoices-mobile-list"'
const rowAt = view.indexOf(wrapped)
const listAt = view.indexOf(list)
ok(view.split(wrapped).length === 2, 'filterraekken kan krympe')
ok(rowAt >= 0 && listAt > rowAt, 'filterraekken staar foer mobilisten')
ok(view.split(bare).length === 1, 'den bare filterraekke er vaek')
ok(!view.includes(bare), 'den bare filterraekke er vaek')
ok(view.includes('{f.label}'), 'knapperne bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-filter-row-wrap-test')
