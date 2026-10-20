/**
 * Linket Aabn originalen paa fakturadetaljen kan krympe.
 * Teksten bliver.
 *   npx tsx scripts/incoming-invoice-detail-original-link-wrap-test.ts
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
const wrapped = 'className="text-red-700 hover:underline break-words min-w-0"'
const bare = 'className="text-red-700 hover:underline"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'originallinket kan krympe')
ok(after.includes('Åbn originalen'), 'originalteksten bliver')
ok(view.split(bare).length === 1, 'det bare originallink er vaek')
ok(!view.includes(bare), 'det bare originallink er vaek')
ok(view.includes('className="text-gray-700 hover:underline break-words min-w-0"'), 'arbejdsordrelinket bliver')
ok(view.includes('className="flex items-center gap-2 text-xs pt-1 border-t min-w-0"'), 'totalraekken bliver')
ok(after.includes('Total'), 'totalteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-original-link-wrap-test')
