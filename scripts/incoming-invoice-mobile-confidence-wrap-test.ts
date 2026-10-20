/**
 * Konfidenslinjen paa fakturalistens mobilkort kan krympe. Konfidensen bliver.
 *   npx tsx scripts/incoming-invoice-mobile-confidence-wrap-test.ts
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
const wrapped = '<p className="mt-2 text-xs break-words min-w-0">'
const bare = '<p className="mt-2 text-xs">'
const dates = '<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 break-words min-w-0">'
const rowAt = view.indexOf(wrapped)
const dateAt = view.indexOf(dates)
ok(view.split(wrapped).length === 2, 'konfidenslinjen kan krympe')
ok(rowAt >= 0 && dateAt >= 0 && rowAt > dateAt, 'konfidenslinjen staar under datoraekken')
ok(view.split(bare).length === 1, 'den bare konfidenslinje er vaek')
ok(!view.includes(bare), 'den bare konfidenslinje er vaek')
ok(view.includes('<Confidence row={r} />'), 'konfidensen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-mobile-confidence-wrap-test')
