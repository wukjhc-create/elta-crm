/**
 * Rammen paa fakturakontrol kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-panel-frame-wrap-test.ts
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
const id = '<div className="bg-white rounded-lg ring-1 ring-gray-200 p-4 break-words min-w-0" data-testid="invoice-control-panel">'
const bare = '<div className="bg-white rounded-lg ring-1 ring-gray-200 p-4" data-testid="invoice-control-panel">'
const marker = '>Fakturakontrol</h3>'
const at = view.indexOf(id)
const markerAt = at >= 0 ? view.indexOf(marker, at) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<div'), 'det er en ramme')
ok(row.includes('break-words min-w-0'), 'rammen kan krympe')
ok(row.includes('ring-1 ring-gray-200'), 'ringen bliver')
ok(row.includes('data-testid="invoice-control-panel"'), 'testiden bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'rammen staar foer titlen')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste ramme')
ok(between.includes(marker), 'titlen bliver')
ok(between.includes('flex flex-wrap items-start justify-between gap-2 mb-3 break-words min-w-0'), 'sidehovedet kan stadig krympe')
ok(view.indexOf(id) === view.lastIndexOf(id), 'rammen findes en gang')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(bare).length === 1, 'den bare ramme er vaek')
ok(!view.includes(bare), 'den bare ramme er vaek')
ok(view.includes('<span className="text-gray-400 break-words min-w-0">'), 'aarsagen kan stadig krympe')
ok(view.includes('min-h-[44px] px-3 text-sm font-medium border rounded-lg text-gray-800'), 'Proev igen er hoej nok')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')
ok(view.includes("res.hasSupplier ? 'Kendt'"), 'leverandoerteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-panel-frame-wrap-test')
