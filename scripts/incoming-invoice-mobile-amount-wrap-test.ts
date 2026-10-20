/**
 * Beloebet paa mobilkortet for indgaaende fakturaer kan krympe. fmtAmount bliver.
 *   npx tsx scripts/incoming-invoice-mobile-amount-wrap-test.ts
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
const id = '<p className="font-medium text-gray-900 mt-2 break-words min-w-0">{fmtAmount(r.amount_incl_vat, r.currency)}</p>'
const bare = '<p className="font-medium text-gray-900 mt-2">{fmtAmount(r.amount_incl_vat, r.currency)}</p>'
const marker = 'data-testid="incoming-invoices-mobile-list"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.indexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt <= at ? view.slice(markerAt, at + id.length) : ''
const desk = view.indexOf('hidden md:block')
ok(row.startsWith('<p'), 'det er mobilbeloebet')
ok(row.includes('break-words min-w-0'), 'beloebet kan krympe')
ok(row.includes('fmtAmount(r.amount_incl_vat, r.currency)'), 'kaldet bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(marker), 'listen staar foer beloebet')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er det naermeste beloeb')
ok(between.includes(id), 'det er mobilbeloebet')
ok(desk > at, 'skrivebordet kommer bagefter')
ok(!between.includes('hidden md:block'), 'skrivebordet er et andet sted')
ok(view.indexOf(id) === view.lastIndexOf(id), 'beloebet findes en gang')
ok(view.split(id).length === 2, 'beloebet findes en gang')
ok(view.split(bare).length === 1, 'det bare beloeb er vaek')
ok(!view.includes(bare), 'det bare beloeb er vaek')
ok(view.includes("const fmtAmount = (n: number | null, ccy = 'DKK')"), 'formateringen bliver')
ok(view.includes("style: 'currency'"), 'valutaformatet bliver')
ok(view.includes('<td className="px-3 py-2 text-right font-medium break-words min-w-0">{fmtAmount(r.amount_incl_vat, r.currency)}</td>'), 'skrivebordsbeloebet kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-mobile-amount-wrap-test')
