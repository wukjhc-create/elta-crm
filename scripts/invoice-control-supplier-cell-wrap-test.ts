/**
 * Cellen Leverandør paa fakturakontrol kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-supplier-cell-wrap-test.ts
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
const id = '<div className="break-words min-w-0">'
const bare = '<div className="min-w-0">'
const marker = 'data-testid="invoice-control-label-supplier"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<div'), 'det er en celle')
ok(row.includes('break-words min-w-0'), 'cellen kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'cellen staar foer etiketten')
ok(between.indexOf(id, 1) === -1, 'det er den naermeste celle')
ok(between.includes(marker), 'det er leverandoer')
ok(!between.includes('hasSupplier'), 'teksten er et andet sted')
ok(!between.includes('invoice-control-label-overcharge'), 'overpriscellen er et andet sted')
ok(!between.includes('invoice-control-label-controlled'), 'den kontrollerede celle er et andet sted')
ok(view.split(id).length === 4, 'cellerne kan krympe')
ok(view.split(bare).length === 1, 'ingen bar celle bliver')
ok(!view.includes(bare), 'ingen bar celle bliver')
ok(view.includes("{res.hasSupplier ? 'Kendt'"), 'leverandoerteksten bliver')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-supplier-cell-wrap-test')
