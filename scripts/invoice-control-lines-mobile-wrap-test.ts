/**
 * Mobilisten paa fakturakontrol kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-lines-mobile-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx', 'utf8')
const id = '<div className="md:hidden divide-y rounded ring-1 ring-gray-200 break-words min-w-0" data-testid="invoice-control-lines-mobile">'
const bare = '<div className="md:hidden divide-y rounded ring-1 ring-gray-200" data-testid="invoice-control-lines-mobile">'
const marker = 'data-testid="invoice-control-lines-mobile"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf('<div', markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<div'), 'det er en liste')
ok(row.includes('break-words min-w-0'), 'listen kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(row.includes(marker), 'testidet bliver')
ok(view.split(id).length === 2, 'listen findes en gang')
ok(view.split(bare).length === 1, 'den bare liste er vaek')
ok(!view.includes(bare), 'den bare liste er vaek')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes("{res.hasSupplier ? 'Kendt'"), 'leverandoerteksten bliver')
ok(view.split('<div className="break-words min-w-0">').length === 4, 'opsummeringscellerne bliver')
ok(view.split('<div className="min-w-0">').length === 1, 'ingen bar celle bliver')
ok(view.includes('<div className="hidden md:block overflow-x-auto break-words min-w-0">'), 'skrivebordslisten kan krympe')
ok(view.split('<div className="hidden md:block overflow-x-auto">').length === 1, 'den bare skrivebordsliste er vaek')
ok(view.includes('expectedUnitPrice'), 'forventet pris bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-lines-mobile-wrap-test')
