/**
 * Skrivebordsraekken paa fakturakontrol kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-desktop-row-wrap-test.ts
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
const id = '<tr key={l.lineNumber} className={`border-t break-words min-w-0 ${bad ? \'bg-red-50\' : \'\'}`}>'
const bare = '<tr key={l.lineNumber} className={`border-t ${bad ? \'bg-red-50\' : \'\'}`}>'
const marker = 'data-testid="invoice-control-desktop-line-number"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<tr'), 'det er en raekke')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('bg-red-50'), 'overprisfarven bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'raekken staar foer linjenummeret')
ok(between.indexOf(id, 1) === -1, 'det er den naermeste raekke')
ok(between.includes(marker), 'det er skrivebordet')
ok(!between.includes('invoice-control-lines-mobile'), 'mobilisten er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(bare).length === 1, 'den bare raekke er vaek')
ok(!view.includes(bare), 'den bare raekke er vaek')
ok(view.includes('<tbody className="break-words min-w-0">'), 'tabelkroppen kan stadig krympe')
ok(view.includes('<thead className="break-words min-w-0">'), 'tabelhovedet kan stadig krympe')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')
ok(view.includes('py-1 break-words min-w-0'), 'linjenummercellen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-desktop-row-wrap-test')
