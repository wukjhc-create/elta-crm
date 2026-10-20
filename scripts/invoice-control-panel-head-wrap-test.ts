/**
 * Sidehovedet paa fakturakontrol kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-panel-head-wrap-test.ts
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
const id = '<div className="flex flex-wrap items-start justify-between gap-2 mb-3 break-words min-w-0">'
const bare = '<div className="flex flex-wrap items-start justify-between gap-2 mb-3">'
const marker = '>Fakturakontrol</h3>'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<div'), 'det er et sidehoved')
ok(row.includes('break-words min-w-0'), 'sidehovedet kan krympe')
ok(row.includes('flex-wrap'), 'sidehovedet ombryder stadig')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'sidehovedet staar foer titlen')
ok(between.indexOf(id, 1) === -1, 'det er det naermeste sidehoved')
ok(between.includes(marker), 'titlen bliver')
ok(!between.includes('invoice-control-lines-mobile'), 'mobilisten er et andet sted')
ok(view.split(id).length === 2, 'sidehovedet findes en gang')
ok(view.split(bare).length === 1, 'det bare sidehoved er vaek')
ok(!view.includes(bare), 'det bare sidehoved er vaek')
ok(view.includes('<div className="flex items-start justify-between gap-2 break-words min-w-0">'), 'titelraekken kan stadig krympe')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')
ok(view.includes('data-testid="invoice-control-verdict"'), 'dommen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-panel-head-wrap-test')
