/**
 * Economic-id paa den indgaaende fakturadetalje kan krympe.
 * Id'et er uaendret. Sagsnummeret og den udgaaende fakturadetalje er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-economic-id-wrap-test.ts
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
const wrapped = '<code className="text-xs break-words min-w-0">{inv.external_invoice_id}</code>'
const bare = '<code className="text-xs">{inv.external_invoice_id}</code>'
ok(view.includes(wrapped), 'economic-id kan krympe')
ok(!view.includes(bare), 'det bare economic-id er vaek')
ok(view.split(wrapped).length === 2, 'economic-id er et')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('{inv.external_invoice_id}'), 'id-et bliver')
ok(view.includes('e-conomic ID'), 'etiketten bliver')

const amount = '<div className="text-right min-w-0 break-words">'
ok(view.includes(amount), 'belobskolonnen bliver')
ok(view.split(amount).length === 2, 'belobskolonnen er en')
ok(view.includes('fmtAmount(inv.amount_incl_vat, inv.currency)'), 'beloebet bliver')

const order = readFileSync('src/app/dashboard/orders/[id]/order-detail-client.tsx', 'utf8')
const caseCode = '<code className="text-xs">{sag.case_number}</code>'
ok(order.includes(caseCode), 'sagsnummeret bliver')
ok(order.split(caseCode).length === 2, 'sagsnummeret er et')

const other = readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
const bareHeader = 'className="flex items-start justify-between flex-wrap gap-3"'
const wrappedHeader = 'className="flex items-start justify-between flex-wrap gap-3 break-words min-w-0"'
ok(other.includes(bareHeader), 'udgaaende sidehoved bliver')
ok(!other.includes(wrappedHeader), 'udgaaende sidehoved er bar')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-economic-id-wrap-test')
