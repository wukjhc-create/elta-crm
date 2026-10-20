/**
 * Tabelhovedet paa fakturakontrol kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-thead-wrap-test.ts
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
const id = '<thead className="break-words min-w-0">'
const bare = '<thead><tr'
const marker = 'data-testid="invoice-control-col-number"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<thead'), 'det er et tabelhoved')
ok(row.includes('break-words min-w-0'), 'tabelhovedet kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'tabelhovedet staar foer kolonnen')
ok(between.indexOf(id, 1) === -1, 'det er det naermeste tabelhoved')
ok(between.includes(marker), 'det er skrivebordet')
ok(!between.includes('invoice-control-lines-mobile'), 'mobilisten er et andet sted')
ok(view.split(id).length === 2, 'tabelhovedet findes en gang')
ok(view.split(bare).length === 1, 'det bare tabelhoved er vaek')
ok(!view.includes(bare), 'det bare tabelhoved er vaek')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('<table className="w-full text-xs break-words min-w-0">'), 'tabellen kan stadig krympe')
ok(view.includes('<tbody>'), 'tabelkroppen bliver')
ok(view.includes('>#<'), 'nummertegnet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-thead-wrap-test')
