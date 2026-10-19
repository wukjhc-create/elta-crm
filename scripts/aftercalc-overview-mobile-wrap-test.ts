/**
 * Mobillisten paa efterkalkulation kan krympe. Kortene og filtrene bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-wrap-test.ts
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
const id = 'data-testid="aftercalc-overview-mobile"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
const bare = '<div className="md:hidden space-y-2" data-testid="aftercalc-overview-mobile">'
const cell = '<div className="md:hidden space-y-2 break-words min-w-0" data-testid="aftercalc-overview-mobile">'
ok(row.startsWith('<div'), 'det er mobillisten')
ok(row.includes('break-words min-w-0'), 'mobillisten kan krympe')
ok(row.includes('md:hidden space-y-2'), 'den er stadig kun mobil')
ok(!row.includes('article'), 'kortet er et andet sted')
ok(!row.includes('Sag'), 'sagslinket er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'mobillisten findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'den bare liste er vaek')
ok(view.includes('<article key={r.case_id} className="rounded-lg ring-1 ring-gray-200 p-3 break-words min-w-0" data-testid="aftercalc-mobile-card">'), 'mobilkortet kan krympe')
ok(view.includes('data-testid="aftercalc-mobile-status"'), 'mobilstatus bliver')
ok(view.includes('hidden md:block overflow-x-auto'), 'skrivebordstabellen bliver')
ok(view.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beloeb bliver')
ok(view.includes('Ingen sager matcher filtrene.'), 'filtertom er uændret')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige'), 'Forrige bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const pager = 'data-testid="aftercalc-pager-row"'
const pat = view.indexOf(pager)
const pagerRow = pat >= 0 ? view.slice(pat - 109, pat + 10) : ''
ok(pagerRow.startsWith('<div'), 'sidevaelgerens vindue bliver')
ok(pagerRow.includes('break-words min-w-0'), 'sidevaelgeren kan stadig krympe')
ok(!pagerRow.includes(id), 'sidevaelgeren er ikke mobillisten')
const emptyStart = view.indexOf('data-testid="aftercalc-empty"')
const between = emptyStart >= 0 && at > emptyStart ? view.slice(emptyStart, at) : ''
ok(between.includes('Ingen sager i oversigten. Opret en sag fra kunden, så den kan efterkalkuleres her.'), 'tom oversigt er uændret')
ok(!between.includes(' truncate') && !between.includes('truncate '), 'den tomme tekst klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-wrap-test')
