/**
 * Maerkeraekken paa fakturalistens mobilkort kan krympe. Maerkerne bliver.
 *   npx tsx scripts/incoming-invoice-mobile-badge-row-wrap-test.ts
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
const wrapped = '<div className="flex flex-wrap items-center gap-2 mt-1 break-words min-w-0">'
const bare = '<div className="flex flex-wrap items-center gap-2 mt-1">'
const title = '<div className="flex items-start justify-between gap-2 break-words min-w-0">'
const rowAt = view.indexOf(wrapped)
const titleAt = view.indexOf(title)
ok(view.split(wrapped).length === 2, 'maerkeraekken kan krympe')
ok(rowAt >= 0 && titleAt >= 0 && rowAt > titleAt, 'maerkeraekken staar under titelraekken')
ok(view.split(bare).length === 1, 'den bare maerkeraekke er vaek')
ok(!view.includes(bare), 'den bare maerkeraekke er vaek')
ok(view.includes('<NotInvoiceBadge />'), 'ikke-faktura-maerket bliver')
ok(view.includes('<DuplicateBadge />'), 'dubletmaerket bliver')
ok(view.includes('<TestBadge />'), 'testmaerket bliver')
ok(view.includes('font-mono text-xs text-gray-700 break-all'), 'fakturanummeret bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-mobile-badge-row-wrap-test')
