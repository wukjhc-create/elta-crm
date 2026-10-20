/**
 * Rammen om manuel gennemgang paa fakturadetaljen kan krympe.
 * Overskrift og konfidenslinje bliver.
 *   npx tsx scripts/incoming-invoice-detail-review-frame-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const wrapped = 'className="rounded-md bg-amber-50 ring-1 ring-amber-300 px-4 py-3 break-words min-w-0"'
const bare = 'className="rounded-md bg-amber-50 ring-1 ring-amber-300 px-4 py-3"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 280)
ok(view.split(wrapped).length === 2, 'rammen kan krympe')
ok(after.includes('Faktura kræver manuel gennemgang'), 'overskriften bliver')
ok(view.split(bare).length === 1, 'den bare ramme er vaek')
ok(!view.includes(bare), 'den bare ramme er vaek')
ok(view.includes('className="text-sm text-amber-800 mt-1 break-words min-w-0"'), 'konfidenslinjen bliver')
ok(view.includes('className="rounded-md bg-amber-50 ring-1 ring-amber-300 px-4 py-2 text-xs text-amber-900 break-words min-w-0"'), 'testfaktura-rammen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-review-frame-wrap-test')
