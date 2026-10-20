/**
 * Fakturadatoen paa fakturalistens skrivebord kan krympe. fmtDate bliver.
 *   npx tsx scripts/incoming-invoice-desktop-date-wrap-test.ts
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
const wrapped = '<td className="px-3 py-2 text-xs break-words min-w-0">{fmtDate(r.invoice_date)}</td>'
const bare = '<td className="px-3 py-2 text-xs">{fmtDate(r.invoice_date)}</td>'
const mobile = '<span>Faktura {fmtDate(r.invoice_date)}</span>'
ok(view.split(wrapped).length === 2, 'skrivebordsdatoen kan krympe')
ok(view.split(bare).length === 1, 'den bare skrivebordsdato er vaek')
ok(!view.includes(bare), 'den bare skrivebordsdato er vaek')
ok(view.split(mobile).length === 2, 'mobildatoen bliver')
ok(view.includes("const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')"), 'datoen formateres som foer')
ok(view.split('fmtDate(r.invoice_date)').length === 3, 'begge datokald bliver')

const desk = view.indexOf('hidden md:block')
const deskDate = desk >= 0 ? view.indexOf(wrapped, desk) : -1
ok(deskDate > desk, 'skrivebordsdatoen staar i tabellen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-date-wrap-test')
