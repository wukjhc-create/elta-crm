/**
 * Fakturanummeret i hovedet paa fakturadetaljen kan krympe.
 * Nummeret er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-invoice-number-wrap-test.ts
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
const wrapped = '<span className="font-mono break-words min-w-0">{inv.invoice_number ?? \'—\'}</span>'
const bare = '<span className="font-mono">{inv.invoice_number ?? \'—\'}</span>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'fakturanummeret kan krympe')
ok(after.includes('{inv.invoice_number ?? \'—\'}'), 'nummeret bliver')
ok(view.split(bare).length === 1, 'det bare fakturanummer er vaek')
ok(!view.includes(bare), 'det bare fakturanummer er vaek')
ok(view.includes('<span className="font-mono text-xs break-words min-w-0">{detail.case.case_number}</span>'), 'sagsnummeret bliver')
ok(view.includes('<span className="font-mono">{inv.payment_reference ?? \'—\'}</span>'), 'betalingsreferencen bliver')
ok(view.includes('<span className="font-mono break-all">{inv.invoice_number ?? \'—\'}</span>'), 'overskriftens nummer bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-invoice-number-wrap-test')
