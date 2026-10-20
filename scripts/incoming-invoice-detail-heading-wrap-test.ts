/**
 * Overskriften paa fakturadetaljen kan krympe. Navn og TEST-maerke bliver.
 *   npx tsx scripts/incoming-invoice-detail-heading-wrap-test.ts
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
const wrapped = 'className="text-2xl font-semibold mt-1 flex flex-wrap items-start gap-2 break-words min-w-0"'
const bare = 'className="text-2xl font-semibold mt-1 flex flex-wrap items-start gap-2"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt + wrapped.length, classAt + wrapped.length + 220)
ok(view.split(wrapped).length === 2, 'overskriften kan krympe')
ok(after.includes('Ukendt leverandør'), 'leverandørnavnet bliver')
ok(view.split(bare).length === 1, 'den bare overskrift er vaek')
ok(!view.includes(bare), 'den bare overskrift er vaek')
ok(view.includes('className="text-[11px] uppercase tracking-wide bg-amber-200 text-amber-900 px-2 py-0.5 rounded break-words min-w-0"'), 'testmaerket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-heading-wrap-test')
