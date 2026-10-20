/**
 * Raekken Ret fakturahoved paa fakturadetaljen kan krympe.
 * Knappen bliver.
 *   npx tsx scripts/incoming-invoice-detail-edit-row-wrap-test.ts
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
const wrapped = 'className="flex justify-end -mt-1 mb-1 break-words min-w-0"'
const bare = 'className="flex justify-end -mt-1 mb-1"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 500)
ok(view.split(wrapped).length === 2, 'ret-raekken kan krympe')
ok(after.includes('Ret fakturahoved'), 'knapteksten bliver')
ok(after.includes('data-testid="header-edit-open"'), 'test-id bliver')
ok(after.includes('className="text-xs text-emerald-700 hover:underline"'), 'knapklassen bliver')
ok(view.split(bare).length === 1, 'den bare ret-raekke er vaek')
ok(!view.includes(bare), 'den bare ret-raekke er vaek')
ok(view.includes('className="flex flex-wrap items-center justify-end gap-3 break-words min-w-0"'), 'handlingsraekken bliver')
ok(view.includes('className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between w-full text-left"'), 'sagsraekken bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-edit-row-wrap-test')
