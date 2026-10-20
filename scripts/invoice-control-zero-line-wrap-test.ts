/**
 * Nul-linjen paa fakturakontrol kan krympe. Saetningen bliver.
 *   npx tsx scripts/invoice-control-zero-line-wrap-test.ts
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
const id = '<p className="text-[10px] text-gray-500 break-words min-w-0">'
const bare = '<p className="text-[10px] text-gray-500 break-words">'
const marker = 'Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'
const at = view.indexOf(id)
const markerAt = at >= 0 ? view.indexOf(marker, at) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<p'), 'det er en nul-linje')
ok(row.includes('break-words min-w-0'), 'nul-linjen kan krympe')
ok(row.includes('text-[10px]'), 'stoerrelsen bliver')
ok(row.includes('text-gray-500'), 'farven bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'linjen staar foer saetningen')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste nul-linje')
ok(between.includes(marker), 'saetningen bliver')
ok(view.indexOf(id) === view.lastIndexOf(id), 'nul-linjen findes en gang')
ok(view.split(id).length === 2, 'nul-linjen findes en gang')
ok(view.split(bare).length === 1, 'den bare nul-linje er vaek')
ok(!view.includes(bare), 'den bare nul-linje er vaek')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('data-testid="invoice-control-panel"'), 'rammen bliver')
ok(view.includes('<div className="bg-white rounded-lg ring-1 ring-gray-200 p-4 break-words min-w-0" data-testid="invoice-control-panel">'), 'rammen kan stadig krympe')
ok(view.includes("res.hasSupplier ? 'Kendt'"), 'leverandoerteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-zero-line-wrap-test')
