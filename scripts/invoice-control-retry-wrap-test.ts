/**
 * Knappen Proev igen paa fakturakontrol kan krympe. Hoejden paa 44 px bliver.
 *   npx tsx scripts/invoice-control-retry-wrap-test.ts
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
const id = '<button type="button" onClick={() => setTryKey((n) => n + 1)} className="mt-2 min-h-[44px] px-3 text-sm font-medium border rounded-lg text-gray-800 break-words min-w-0">'
const bare = '<button type="button" onClick={() => setTryKey((n) => n + 1)} className="mt-2 min-h-[44px] px-3 text-sm font-medium border rounded-lg text-gray-800">'
const marker = 'Prøv igen'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<button'), 'det er en knap')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('min-h-[44px]'), 'hoejden bliver')
ok(row.includes('setTryKey'), 'genforsoeget bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'knappen staar foer teksten')
ok(between.indexOf(id, 1) === -1, 'det er den naermeste knap')
ok(between.includes(marker), 'teksten bliver')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(bare).length === 1, 'den bare knap er vaek')
ok(!view.includes(bare), 'den bare knap er vaek')
ok(view.includes('<div className="text-xs text-red-600 break-words min-w-0">'), 'fejlrammen kan stadig krympe')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-retry-wrap-test')
