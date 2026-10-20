/**
 * Beloebslisten paa efterkalkulationens mobilkort kan krympe. Beloebene bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-money-list-wrap-test.ts
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
const id = '<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs break-words min-w-0">'
const oldId = '<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0">'
const marker = '>Tilbudt omsætning</dt>'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<dl'), 'det er en liste')
ok(row.includes('break-words min-w-0'), 'listen kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'listen staar foer etiketten')
ok(between.indexOf('<dl', 1) === -1, 'det er den naermeste liste')
ok(between.includes(marker), 'det er tilbudt omsaetning')
ok(!between.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!between.includes('>Tilbudt omsætning</th>'), 'skrivebordskolonnen er et andet sted')
ok(view.split(id).length === 2, 'mobilkortets liste kan krympe')
ok(view.split(oldId).length === 1, 'den bare liste er vaek')
ok(!view.includes(oldId), 'ingen bar liste bliver')
ok(view.split('<div className="break-words min-w-0">').length === 6, 'kolonnerne kan stadig krympe')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('{kr(r.actual_revenue)}'), 'faktisk beloeb bliver')
ok(view.includes('{pct(r.quoted_db_pct)}'), 'tilbudt db bliver')
ok(view.includes('{pct(r.actual_db_pct)}'), 'faktisk db bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-money-list-wrap-test')
