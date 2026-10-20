/**
 * Knapraekken i fakturalistens sidehoved kan krympe. Knapperne bliver.
 *   npx tsx scripts/incoming-invoice-page-button-row-wrap-test.ts
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
const wrapped = '<div className="flex items-center gap-2 flex-wrap break-words min-w-0">'
const bare = '<div className="flex items-center gap-2 flex-wrap">'
const actions = '<div className="flex items-start justify-between flex-wrap gap-2 break-words min-w-0">'
const upload = '<UploadInvoiceButton />'
const rowAt = view.indexOf(wrapped)
const actionsAt = view.indexOf(actions)
const uploadAt = view.indexOf(upload)
ok(view.split(wrapped).length === 2, 'knapraekken kan krympe')
ok(rowAt >= 0 && actionsAt >= 0 && rowAt > actionsAt, 'knapraekken staar under handlingsraekken')
ok(rowAt >= 0 && uploadAt >= 0 && rowAt < uploadAt, 'knapraekken staar over upload-knappen')
ok(view.split(bare).length === 1, 'den bare knapraekke er vaek')
ok(!view.includes(bare), 'den bare knapraekke er vaek')
ok(view.includes(upload), 'upload-knappen bliver')
ok(view.includes('onClick={createTestInvoice}'), 'testknappen bliver')
ok(view.includes('Opretter…'), 'opretter-etiketten bliver')
ok(view.includes('+ Opret test-leverandørfaktura'), 'testfaktura-etiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-page-button-row-wrap-test')
