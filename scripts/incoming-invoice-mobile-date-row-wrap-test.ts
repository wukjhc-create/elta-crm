/**
 * Datoraekken paa fakturalistens mobilkort kan krympe. Dato og forfald bliver.
 *   npx tsx scripts/incoming-invoice-mobile-date-row-wrap-test.ts
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
const wrapped = '<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 break-words min-w-0">'
const bare = '<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">'
const badges = '<div className="flex flex-wrap items-center gap-2 mt-1 break-words min-w-0">'
const rowAt = view.indexOf(wrapped)
const badgeAt = view.indexOf(badges)
ok(view.split(wrapped).length === 2, 'datoraekken kan krympe')
ok(rowAt >= 0 && badgeAt >= 0 && rowAt > badgeAt, 'datoraekken staar under maerkeraekken')
ok(view.split(bare).length === 1, 'den bare datoraekke er vaek')
ok(!view.includes(bare), 'den bare datoraekke er vaek')
ok(view.includes('{fmtDate(r.invoice_date)}'), 'fakturadatoen bliver')
ok(view.includes('withLabel'), 'forfaldsmaerket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-mobile-date-row-wrap-test')
