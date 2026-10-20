/**
 * Knapraekken ved sagen paa fakturadetaljen kan krympe.
 * Knapperne bliver.
 *   npx tsx scripts/incoming-invoice-detail-case-actions-wrap-test.ts
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
const wrapped = 'className="flex items-center gap-1.5 shrink-0 break-words min-w-0"'
const bare = 'className="flex items-center gap-1.5 shrink-0"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'sagsknapperne kan krympe')
ok(after.includes('Skift sag'), 'skift-teksten bliver')
ok(after.includes('Match til sag'), 'match-teksten bliver')
ok(after.includes('Fjern sag'), 'fjern-teksten bliver')
ok(after.includes('…'), 'venteteksten bliver')
ok(view.split(bare).length === 1, 'den bare knapraekke er vaek')
ok(!view.includes(bare), 'den bare knapraekke er vaek')
ok(view.includes('className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between w-full text-left break-words min-w-0"'), 'sagsraekken bliver')
ok(view.includes('className="text-[11px] px-2 py-0.5 rounded ring-1 ring-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 break-words min-w-0"'), 'match-knappen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-case-actions-wrap-test')
