/**
 * Sidehovedets raekke paa den indgaaende fakturadetalje kan krympe.
 * Indholdet er uaendret. Den udgaaende fakturadetalje er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-header-row-wrap-test.ts
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
const wrapped = 'className="flex items-start justify-between flex-wrap gap-3 break-words min-w-0"'
const bare = 'className="flex items-start justify-between flex-wrap gap-3"'
ok(view.includes(wrapped), 'sidehovedet kan krympe')
ok(!view.includes(bare), 'det bare sidehoved er vaek')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('href="/dashboard/incoming-invoices"'), 'linket bliver')
ok(view.includes('← Indgående fakturaer'), 'linkteksten bliver')
ok(view.includes('fmtAmount(inv.amount_incl_vat, inv.currency)'), 'beloebet bliver')

const code = '<code className="text-xs break-words min-w-0">{inv.external_invoice_id}</code>'
ok(view.includes(code), 'economic-koden bliver')
ok(view.split(code).length === 2, 'economic-koden er en')

const other = readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
ok(other.includes(bare), 'udgaaende sidehoved bliver')
ok(!other.includes(wrapped), 'udgaaende sidehoved er bar')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-header-row-wrap-test')
