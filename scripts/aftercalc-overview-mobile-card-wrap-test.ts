/**
 * Mobilkortet paa efterkalkulation kan krympe. Beloeb og filtre bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-card-wrap-test.ts
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
const id = 'data-testid="aftercalc-mobile-card"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 93, at + 10) : ''
const bare = '<article key={r.case_id} className="rounded-lg ring-1 ring-gray-200 p-3">'
const cell = '<article key={r.case_id} className="rounded-lg ring-1 ring-gray-200 p-3 break-words min-w-0" data-testid="aftercalc-mobile-card">'
ok(row.startsWith('<article'), 'det er mobilkortet')
ok(row.includes('break-words min-w-0'), 'mobilkortet kan krympe')
ok(row.includes('rounded-lg ring-1 ring-gray-200 p-3'), 'ringen bliver')
ok(!row.includes('Link'), 'sagslinket er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'mobilkortet findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'det bare kort er vaek')
ok(view.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beloeb bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt omsaetning bliver')
ok(view.includes('{kr(r.actual_revenue)}'), 'faktisk omsaetning bliver')
ok(view.includes('{pct(r.quoted_db_pct)}'), 'tilbudt db bliver')
ok(view.includes('{pct(r.actual_db_pct)}'), 'faktisk db bliver')
ok(view.includes('data-testid="aftercalc-mobile-status"'), 'mobilstatus bliver')
ok(view.includes('hidden md:block overflow-x-auto'), 'skrivebordstabellen bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const mobile = 'data-testid="aftercalc-overview-mobile"'
const mat = view.indexOf(mobile)
const mobileRow = mat >= 0 ? view.slice(mat - 57, mat + 10) : ''
ok(mobileRow.startsWith('<div'), 'mobillistens vindue bliver')
ok(mobileRow.includes('md:hidden space-y-2'), 'listen er stadig kun mobil')
ok(!mobileRow.includes(id), 'mobillisten er ikke kortet')
ok(!mobileRow.includes('\n'), 'mobillistens vindue har ikke linjeskift')
const pager = 'data-testid="aftercalc-pager-row"'
const pat = view.indexOf(pager)
const pagerRow = pat >= 0 ? view.slice(pat - 109, pat + 10) : ''
ok(pagerRow.startsWith('<div'), 'sidevaelgerens vindue bliver')
ok(!pagerRow.includes(id), 'sidevaelgeren er ikke kortet')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-card-wrap-test')
