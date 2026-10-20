/**
 * Beloebskolonnen i sidehovedet paa den indgaaende fakturadetalje kan krympe.
 * Beloebet er uaendret. Andre filer med samme klasse er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-amount-column-wrap-test.ts
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
const wrapped = '<div className="text-right min-w-0 break-words">'
const bare = '<div className="text-right min-w-0">'
ok(view.includes(wrapped), 'belobskolonnen kan krympe')
ok(!view.includes(bare), 'den bare belobskolonne er vaek')
ok(view.split(wrapped).length === 2, 'belobskolonnen er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('fmtAmount(inv.amount_incl_vat, inv.currency)'), 'beloebet bliver')
ok(view.includes('incl. moms'), 'moms-teksten bliver')

const note = '<span className="text-xs text-gray-500 break-words min-w-0">Status og bogføring er uændret.</span>'
ok(view.includes(note), 'duplikatteksten bliver')
ok(view.split(note).length === 2, 'duplikatteksten er en')

const code = '<code className="text-xs break-words min-w-0">{inv.external_invoice_id}</code>'
ok(view.includes(code), 'economic-id bliver')
ok(view.split(code).length === 2, 'economic-id er et')

const other = readFileSync('src/components/modules/dashboard/invoice-economy-section.tsx', 'utf8')
ok(other.includes(bare), 'oekonomi-kolonnen bliver')
ok(!other.includes(wrapped), 'oekonomi-kolonnen er bar')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-amount-column-wrap-test')
