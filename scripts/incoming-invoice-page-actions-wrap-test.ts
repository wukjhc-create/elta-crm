/**
 * Sidehovedets handlingsraekke paa fakturalisten kan krympe. Overskrift og knapper bliver.
 *   npx tsx scripts/incoming-invoice-page-actions-wrap-test.ts
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
const wrapped = '<div className="flex items-start justify-between flex-wrap gap-2 break-words min-w-0">'
const bare = '<div className="flex items-start justify-between flex-wrap gap-2">'
const title = '<h1 className="text-2xl font-semibold break-words min-w-0">Indgående fakturaer</h1>'
const rowAt = view.indexOf(wrapped)
const titleAt = view.indexOf(title)
ok(view.split(wrapped).length === 2, 'handlingsraekken kan krympe')
ok(rowAt >= 0 && titleAt >= 0 && rowAt < titleAt, 'handlingsraekken staar over overskriften')
ok(view.split(bare).length === 1, 'den bare handlingsraekke er vaek')
ok(!view.includes(bare), 'den bare handlingsraekke er vaek')
ok(view.includes(title), 'overskriften bliver')
ok(view.includes('<UploadInvoiceButton />'), 'upload-knappen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-page-actions-wrap-test')
