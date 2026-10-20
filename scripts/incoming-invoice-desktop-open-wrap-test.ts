/**
 * Aabn-cellen paa fakturalistens skrivebord kan krympe. Knappen bliver.
 *   npx tsx scripts/incoming-invoice-desktop-open-wrap-test.ts
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
const wrapped = '<td className="px-3 py-2 text-right break-words min-w-0">'
const bare = '<td className="px-3 py-2 text-right">'
const button = '<Button size="sm" variant="outline" aria-label={openInvoiceLabel(r)}>Åbn</Button>'
const href = 'href={`/dashboard/incoming-invoices/${r.id}`}'
const desk = view.indexOf('hidden md:block')
const buttonAt = desk >= 0 ? view.indexOf(button, desk) : -1
const tdAt = buttonAt >= 0 ? view.lastIndexOf('<td', buttonAt) : -1
const td = tdAt >= 0 ? view.slice(tdAt, buttonAt) : ''
ok(view.split(wrapped).length === 2, 'aabn-cellen kan krympe')
ok(td.startsWith(wrapped), 'aabn-cellen kan krympe')
ok(td.includes('break-words min-w-0'), 'aabn-cellen kan krympe')
ok(view.split(bare).length === 1, 'den bare aabn-celle er vaek')
ok(!view.includes(bare), 'den bare aabn-celle er vaek')
ok(view.split(button).length === 3, 'begge aabn-knapper bliver')
ok(view.split(href).length === 5, 'de fire links bliver')
ok(tdAt > desk, 'aabn-cellen staar i tabellen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-open-wrap-test')
