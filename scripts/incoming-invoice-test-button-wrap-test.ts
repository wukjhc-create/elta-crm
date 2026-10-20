/**
 * Testknappen i fakturalistens sidehoved kan krympe. Klik og etiketter bliver.
 *   npx tsx scripts/incoming-invoice-test-button-wrap-test.ts
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
const wrapped = 'className="border-amber-300 text-amber-900 hover:bg-amber-50 break-words min-w-0"'
const bare = 'className="border-amber-300 text-amber-900 hover:bg-amber-50"'
const row = '<div className="flex items-center gap-2 flex-wrap break-words min-w-0">'
const creating = 'Opretter…'
const classAt = view.indexOf(wrapped)
const rowAt = view.indexOf(row)
const creatingAt = view.indexOf(creating)
ok(view.split(wrapped).length === 2, 'testknappen kan krympe')
ok(classAt >= 0 && rowAt >= 0 && classAt > rowAt, 'testknappen staar i knapraekken')
ok(classAt >= 0 && creatingAt >= 0 && classAt < creatingAt, 'testknappen staar over opretter-etiketten')
ok(view.split(bare).length === 1, 'den bare testknap er vaek')
ok(!view.includes(bare), 'den bare testknap er vaek')
ok(view.includes('onClick={createTestInvoice}'), 'klikket bliver')
ok(view.includes('disabled={seedBusy}'), 'deaktiveringen bliver')
ok(view.includes(creating), 'opretter-etiketten bliver')
ok(view.includes('+ Opret test-leverandørfaktura'), 'testfaktura-etiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-test-button-wrap-test')
