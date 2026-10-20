/**
 * Leverandoernavnet paa fakturalistens skrivebord kan krympe. Mobilnavnet bliver.
 *   npx tsx scripts/incoming-invoice-desktop-name-wrap-test.ts
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
const wrapped = 'className="font-medium text-emerald-700 hover:underline break-words min-w-0"'
const bare = 'className="font-medium text-emerald-700 hover:underline break-words"'
const href = 'href={`/dashboard/incoming-invoices/${r.id}`}'
ok(view.split(wrapped).length === 3, 'begge navne kan krympe')
ok(view.split(bare).length === 1, 'det bare navn er vaek')
ok(!view.includes(bare), 'det bare navn er vaek')
ok(view.split(href).length === 5, 'de fire links bliver')
ok(view.split("{r.supplier_name || 'Leverandør mangler'}").length === 3, 'det manglende navn bliver')
ok(view.includes('font-medium text-gray-900 mt-2 break-words min-w-0'), 'mobilbeloebet kan stadig krympe')
ok(view.includes('fmtAmount(r.amount_incl_vat, r.currency)'), 'beloebsfunktionen bliver')

const desk = view.indexOf('hidden md:block')
const deskName = desk >= 0 ? view.indexOf(wrapped, desk) : -1
ok(deskName > desk, 'skrivebordsnavnet kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-name-wrap-test')
