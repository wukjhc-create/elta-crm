/**
 * Handlingsraekken i fakturadetaljens sidehoved kan krympe.
 * Knapperne bliver.
 *   npx tsx scripts/incoming-invoice-detail-actions-row-wrap-test.ts
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
const wrapped = 'className="flex flex-wrap items-center justify-end gap-3 break-words min-w-0"'
const bare = 'className="flex flex-wrap items-center justify-end gap-3"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 800)
ok(view.split(wrapped).length === 2, 'handlingsraekken kan krympe')
ok(after.includes('Slet test-faktura'), 'sletteknappen bliver')
ok(after.includes('Sletter…'), 'venteteksten bliver')
ok(after.includes('className="border-amber-300 text-amber-900 hover:bg-amber-50 break-words min-w-0"'), 'sletteknappen kan stadig krympe')
ok(after.includes('incl. moms'), 'momsnoten bliver')
ok(view.split(bare).length === 1, 'den bare handlingsraekke er vaek')
ok(!view.includes(bare), 'den bare handlingsraekke er vaek')
ok(view.includes('className="flex justify-end -mt-1 mb-1 break-words min-w-0"'), 'ret-raekken bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-actions-row-wrap-test')
