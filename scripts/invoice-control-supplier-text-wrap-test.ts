/**
 * Leverandoerteksten paa fakturakontrol kan krympe. Teksten Kendt bliver.
 *   npx tsx scripts/invoice-control-supplier-text-wrap-test.ts
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
const id = '<div className="font-medium break-words min-w-0">{res.hasSupplier ? \'Kendt\''
const bare = '<div className="font-medium break-words">{res.hasSupplier ? \'Kendt\''
const marker = 'Ukendt — kan ikke matche katalog'
const at = view.indexOf(id)
const markerAt = at >= 0 ? view.indexOf(marker, at) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<div'), 'det er leverandoerteksten')
ok(row.includes('break-words min-w-0'), 'teksten kan krympe')
ok(row.includes('font-medium'), 'vaegten bliver')
ok(row.includes("res.hasSupplier ? 'Kendt'"), 'kendt-teksten bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'teksten staar foer ukendt')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste tekst')
ok(between.includes(marker), 'ukendt-teksten bliver')
ok(view.indexOf(id) === view.lastIndexOf(id), 'teksten findes en gang')
ok(view.split(id).length === 2, 'teksten findes en gang')
ok(view.split(bare).length === 1, 'den bare tekst er vaek')
ok(!view.includes(bare), 'den bare tekst er vaek')
ok(view.includes('font-medium break-words min-w-0">{res.control.controlledLines}'), 'daekningen kan krympe')
ok(view.includes('font-medium break-words ${'), 'overprisens klasse bliver')
ok(view.split('<div className="break-words min-w-0">').length === 4, 'de tre celler bliver')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-supplier-text-wrap-test')
