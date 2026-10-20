/**
 * Fragt-taelleren paa fakturakontrol kan krympe. Tallet bliver.
 *   npx tsx scripts/invoice-control-freight-count-wrap-test.ts
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
const id = '<span className="break-words min-w-0">{review.freight} fragt, {review.fee} gebyr.</span>'
const bare = '<span>{review.freight} fragt, {review.fee} gebyr.</span>'
const marker = 'data-testid="invoice-control-review-counts"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.indexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt <= at ? view.slice(markerAt, at + id.length) : ''
ok(row.startsWith('<span'), 'det er en taeller')
ok(row.includes('break-words min-w-0'), 'taelleren kan krympe')
ok(row.includes('{review.freight} fragt'), 'fragttallet bliver')
ok(row.includes('{review.fee} gebyr.'), 'gebyret bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(marker), 'taellingen staar foer fragt')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste taeller')
ok(between.includes(id), 'det er fragttaelleren')
ok(!view.includes('review.freight + review.fee'), 'tallene laegges ikke sammen')
ok(view.indexOf(id) === view.lastIndexOf(id), 'taelleren findes en gang')
ok(view.split(id).length === 2, 'taelleren findes en gang')
ok(view.split(bare).length === 1, 'den bare taeller er vaek')
ok(!view.includes(bare), 'den bare taeller er vaek')
ok(view.includes('break-words min-w-0 ${review.undercharge'), 'underpris kan stadig krympe')
ok(view.includes('break-words min-w-0 ${review.overcharge'), 'overpris kan stadig krympe')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-freight-count-wrap-test')
