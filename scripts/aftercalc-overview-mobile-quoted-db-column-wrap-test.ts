/**
 * Tilbudt-DB-kolonnen paa efterkalkulationens mobilkort kan krympe. Procenterne bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-quoted-db-column-wrap-test.ts
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
const marker = '>Tilbudt DB</dt>'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<div'), 'det er en kolonne')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'kolonnen staar foer etiketten')
ok(between.indexOf('<div', 1) === -1, 'det er den naermeste kolonne')
ok(between.includes(marker), 'det er tilbudt db')
ok(!between.includes('quoted_db_pct'), 'procenten er et andet sted')
ok(!between.includes('>Faktisk DB</dt>'), 'faktisk db er et andet sted')
ok(!between.includes('>Tilbudt DB %</th>'), 'skrivebordskolonnen er et andet sted')
ok(view.split(id).length === 6, 'mobilkortets kolonner kan krympe')
ok(view.split('<div className="min-w-0">').length === 1, 'den bare kolonne er vaek')
ok(view.includes('{pct(r.quoted_db_pct)}'), 'tilbudt db bliver')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{pct(r.quoted_db_pct)}</dd>'), 'procentlinjen kan krympe')
ok(view.includes('{pct(r.actual_db_pct)}'), 'faktisk db bliver')
ok(view.includes('className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0"'), 'listen bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

ok(!view.includes('<div className="min-w-0">'), 'ingen bar kolonne bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-quoted-db-column-wrap-test')
