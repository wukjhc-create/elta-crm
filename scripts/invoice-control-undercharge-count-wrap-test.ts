/**
 * Underpris-taelleren paa fakturakontrol kan krympe. Tallet bliver.
 *   npx tsx scripts/invoice-control-undercharge-count-wrap-test.ts
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
const id = '<span className={`break-words min-w-0 ${review.undercharge > 0 ? \'text-amber-800 font-medium\' : \'\'}`}>'
const bare = '<span className={review.undercharge > 0 ? \'text-amber-800 font-medium\' : \'\'}>'
const marker = '{review.undercharge} underpris'
const at = view.indexOf(id)
const markerAt = at >= 0 ? view.indexOf(marker, at) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<span'), 'det er en taeller')
ok(row.includes('break-words min-w-0'), 'taelleren kan krympe')
ok(row.includes("review.undercharge > 0 ? 'text-amber-800 font-medium'"), 'gul kun over 0')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'taelleren staar foer tallet')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste taeller')
ok(between.includes(marker), 'tallet bliver')
ok(view.indexOf(id) === view.lastIndexOf(id), 'taelleren findes en gang')
ok(view.split(id).length === 2, 'taelleren findes en gang')
ok(view.split(bare).length === 1, 'den bare taeller er vaek')
ok(!view.includes(bare), 'den bare taeller er vaek')
ok(view.includes('break-words min-w-0 ${review.overcharge'), 'overpris kan stadig krympe')
ok(view.includes('{review.freight} fragt'), 'fragttaelleren bliver')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-undercharge-count-wrap-test')
