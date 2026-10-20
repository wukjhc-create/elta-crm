/**
 * Arbejdsordrelinket paa fakturadetaljen kan krympe.
 * Titlen bliver.
 *   npx tsx scripts/incoming-invoice-detail-work-order-link-wrap-test.ts
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
const wrapped = 'className="text-gray-700 hover:underline break-words min-w-0"'
const bare = 'className="text-gray-700 hover:underline"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'arbejdsordrelinket kan krympe')
ok(after.includes('detail.workOrder.title'), 'titlen bliver')
ok(view.split(bare).length === 1, 'det bare arbejdsordrelink er vaek')
ok(!view.includes(bare), 'det bare arbejdsordrelink er vaek')
ok(view.includes('className="text-[11px] px-2 py-0.5 rounded ring-1 ring-gray-200 text-gray-600 bg-white hover:bg-gray-100 disabled:opacity-50 break-words min-w-0"'), 'fjern-knappen bliver')
ok(view.includes('className="text-red-700 hover:underline"'), 'originallinket bliver')
ok(after.includes('Åbn originalen'), 'originalteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-work-order-link-wrap-test')
