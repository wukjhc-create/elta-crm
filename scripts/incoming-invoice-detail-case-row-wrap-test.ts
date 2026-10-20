/**
 * Sagsraekken paa fakturadetaljen kan krympe.
 * Sagslinket bliver.
 *   npx tsx scripts/incoming-invoice-detail-case-row-wrap-test.ts
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
const wrapped = 'className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between w-full text-left break-words min-w-0"'
const bare = 'className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between w-full text-left"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1400)
ok(view.split(wrapped).length === 2, 'sagsraekken kan krympe')
ok(after.includes('className="text-emerald-700 hover:underline break-words"'), 'sagslinket bliver')
ok(after.includes('Ikke matchet'), 'tom tekst bliver')
ok(view.split(bare).length === 1, 'den bare sagsraekke er vaek')
ok(!view.includes(bare), 'den bare sagsraekke er vaek')
ok(view.includes('className="flex justify-end -mt-1 mb-1 break-words min-w-0"'), 'ret-raekken bliver')
ok(view.includes('className="flex items-center gap-1.5 shrink-0 break-words min-w-0"'), 'sagsknapperne bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-case-row-wrap-test')
