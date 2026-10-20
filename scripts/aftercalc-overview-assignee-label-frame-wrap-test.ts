/**
 * Ansvarlig-etikettens ramme paa efterkalkulation kan krympe. De andre rammer bliver.
 *   npx tsx scripts/aftercalc-overview-assignee-label-frame-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const id = '<label className="block break-words min-w-0">'
const marker = '>Ansvarlig</span>'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt) : ''
const near = at >= 0 ? view.slice(at, at + 180) : ''
ok(row.startsWith('<label'), 'det er en ramme')
ok(row.includes('break-words min-w-0'), 'rammen kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'rammen staar foer etiketten')
ok(between.indexOf('<label', 1) === -1, 'det er den naermeste ramme')
ok(!between.includes('>Til dato</span>'), 'til-dato er et andet sted')
ok(near.includes('>Ansvarlig</span>'), 'det er ansvarlig')
ok(!near.includes('>Status</span>'), 'status er et andet sted')
ok(!near.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(view.includes('<label className="block min-w-0">'), 'de andre rammer bliver')
ok(view.includes('>Ansvarlig</span>'), 'etiketten bliver')
ok(view.includes('value={filters.assigneeId ?? \'\'}'), 'ansvarlig-filteret bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-assignee-label-frame-wrap-test')
