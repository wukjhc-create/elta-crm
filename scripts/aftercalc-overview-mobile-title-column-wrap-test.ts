/**
 * Titelkolonnen paa efterkalkulationens mobilkort kan krympe. Linket og beloebene bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-title-column-wrap-test.ts
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
const id = '<div className="break-words min-w-0">'
const marker = 'data-testid="aftercalc-mobile-case-link"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<div'), 'det er en kolonne')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'kolonnen staar foer linket')
ok(between.indexOf('<div', 1) === -1, 'det er den naermeste kolonne')
ok(between.includes(marker), 'det er titelkolonnen')
ok(between.includes('tab=oekonomi'), 'oekonomilinket bliver')
ok(!between.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!between.includes('>Tilbudt omsætning</dt>'), 'omsætningen er et andet sted')
ok(view.split(id).length === 3, 'titelkolonnen og tilbudt omsaetning kan krympe')
ok(view.includes('<div className="min-w-0">'), 'de andre kolonner bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-title-column-wrap-test')
