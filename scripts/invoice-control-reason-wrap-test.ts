/**
 * Aarsagen paa skrivebordets matchcelle kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-reason-wrap-test.ts
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
const id = '<span className="text-gray-400 break-words min-w-0">'
const bare = '<span className="text-gray-400">'
const marker = 'data-testid="invoice-control-desktop-match"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.indexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt <= at ? view.slice(markerAt, at + id.length) : ''
ok(row.startsWith('<span'), 'det er en aarsag')
ok(row.includes('break-words min-w-0'), 'aarsagen kan krympe')
ok(row.includes('text-gray-400'), 'farven bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(marker), 'cellen staar foer aarsagen')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste aarsag')
ok(between.includes(id), 'det er skrivebordet')
ok(view.includes("{l.reason ?? 'ingen'}"), 'teksten ingen bliver')
ok(view.split(id).length === 2, 'aarsagen findes en gang')
ok(view.split(bare).length === 1, 'den bare aarsag er vaek')
ok(!view.includes(bare), 'den bare aarsag er vaek')
ok(view.includes('min-h-[44px] px-3 text-sm font-medium border rounded-lg text-gray-800'), 'Proev igen er hoej nok')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-reason-wrap-test')
