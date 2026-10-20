/**
 * Knappen Slet test-faktura paa fakturadetaljen kan krympe.
 * Knapteksten bliver.
 *   npx tsx scripts/incoming-invoice-detail-delete-button-wrap-test.ts
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
const wrapped = 'className="border-amber-300 text-amber-900 hover:bg-amber-50 break-words min-w-0"'
const bare = 'className="border-amber-300 text-amber-900 hover:bg-amber-50"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 320)
ok(view.split(wrapped).length === 2, 'knappen kan krympe')
ok(after.includes('Slet test-faktura'), 'teksten bliver')
ok(after.includes('Sletter…'), 'venteteksten bliver')
ok(view.split(bare).length === 1, 'den bare knap er vaek')
ok(!view.includes(bare), 'den bare knap er vaek')
ok(view.includes('className="rounded-md ring-1 ring-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 break-words min-w-0"'), 'fejlrammen bliver')
ok(view.includes('className="flex flex-wrap items-center justify-end gap-3 break-words min-w-0"'), 'handlingsraekken bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-delete-button-wrap-test')
