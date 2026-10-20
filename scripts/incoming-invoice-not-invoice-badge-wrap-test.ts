/**
 * Maerket Ikke en faktura paa fakturalisten kan krympe. Teksten og testid bliver.
 *   npx tsx scripts/incoming-invoice-not-invoice-badge-wrap-test.ts
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
const wrapped = 'className="inline-block text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded break-words min-w-0"'
const bare = 'className="inline-block text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded"'
const testid = 'data-testid="invoice-not-invoice-badge"'
const classAt = view.indexOf(wrapped)
const testAt = view.indexOf(testid)
ok(view.split(wrapped).length === 2, 'maerket ikke en faktura kan krympe')
ok(classAt >= 0 && testAt >= 0 && classAt < testAt, 'klassen staar foer testid')
ok(view.split(bare).length === 1, 'det bare graa maerke er vaek')
ok(!view.includes(bare), 'det bare graa maerke er vaek')
ok(view.includes(testid), 'testid bliver')
ok(view.includes('Ikke en faktura?'), 'teksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-not-invoice-badge-wrap-test')
