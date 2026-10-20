/**
 * Beloebet paa fakturalistens skrivebord kan krympe. Mobilbeloebet bliver.
 *   npx tsx scripts/incoming-invoice-desktop-amount-wrap-test.ts
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
const wrapped = '<td className="px-3 py-2 text-right font-medium break-words min-w-0">{fmtAmount(r.amount_incl_vat, r.currency)}</td>'
const bare = '<td className="px-3 py-2 text-right font-medium">{fmtAmount(r.amount_incl_vat, r.currency)}</td>'
const mobile = '<p className="font-medium text-gray-900 mt-2 break-words min-w-0">{fmtAmount(r.amount_incl_vat, r.currency)}</p>'
ok(view.split(wrapped).length === 2, 'skrivebordsbeloebet kan krympe')
ok(view.split(bare).length === 1, 'det bare skrivebordsbeloeb er vaek')
ok(!view.includes(bare), 'det bare skrivebordsbeloeb er vaek')
ok(view.split(mobile).length === 2, 'mobilbeloebet kan stadig krympe')
ok(view.includes("const fmtAmount = (n: number | null, ccy = 'DKK')"), 'formateringen bliver')
ok(view.includes("style: 'currency'"), 'valutaformatet bliver')

const desk = view.indexOf('hidden md:block')
const deskAmount = desk >= 0 ? view.indexOf(wrapped, desk) : -1
ok(deskAmount > desk, 'skrivebordsbeloebet staar i tabellen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-amount-wrap-test')
