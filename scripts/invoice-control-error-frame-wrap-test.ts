/**
 * Fejlrammen paa fakturakontrol kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-error-frame-wrap-test.ts
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
const id = '<div className="text-xs text-red-600 break-words min-w-0">'
const bare = '<div className="text-xs text-red-600">'
const marker = 'data-testid="invoice-control-load-error"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<div'), 'det er en fejlramme')
ok(row.includes('break-words min-w-0'), 'fejlrammen kan krympe')
ok(row.includes('text-xs text-red-600'), 'farven bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'rammen staar foer fejlteksten')
ok(between.indexOf(id, 1) === -1, 'det er den naermeste ramme')
ok(between.includes(marker), 'det er indlaesningsfejlen')
ok(between.includes('className="break-words min-w-0"'), 'fejlteksten kan stadig krympe')
ok(view.includes('{error}. Det tælles ikke som at priserne stemmer.'), 'saetningen bliver')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(bare).length === 1, 'den bare ramme er vaek')
ok(!view.includes(bare), 'den bare ramme er vaek')
ok(view.includes('min-h-[44px] px-3 text-sm font-medium border rounded-lg text-gray-800'), 'Proev igen er hoej nok')
ok(view.includes('<p className="mt-1 text-gray-600 break-all break-words min-w-0">'), 'matchlinjen kan stadig krympe')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-error-frame-wrap-test')
