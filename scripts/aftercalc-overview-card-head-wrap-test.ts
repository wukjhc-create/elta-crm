/**
 * Hovedet paa efterkalkulationens mobilkort kan krympe. Andre filer bliver.
 *   npx tsx scripts/aftercalc-overview-card-head-wrap-test.ts
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
const id = 'data-testid="aftercalc-card-head"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 76, at + 10) : ''
const bare = '<div className="flex items-start justify-between gap-2">'
const cell = '<div className="flex items-start justify-between gap-2 break-words min-w-0" data-testid="aftercalc-card-head">'
ok(row.startsWith('<div'), 'det er hovedet')
ok(row.includes('break-words min-w-0'), 'hovedet kan krympe')
ok(row.includes('flex items-start justify-between gap-2'), 'raekken bliver')
ok(!row.includes('Link'), 'sagslinket er et andet sted')
ok(!row.includes('Advarsel'), 'status er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'hovedet findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'det bare hoved er vaek')
ok(view.includes('font-medium text-blue-700 hover:underline break-words'), 'sagslinket bliver')
ok(view.includes('tab=oekonomi'), 'oekonomilinket bliver')
ok(view.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beloeb bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt omsaetning bliver')
ok(view.includes('data-testid="aftercalc-mobile-status"'), 'mobilstatus bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const card = 'data-testid="aftercalc-mobile-card"'
const cat = view.indexOf(card)
const cardRow = cat >= 0 ? view.slice(cat - 93, cat + 10) : ''
ok(cardRow.startsWith('<article'), 'kortets vindue bliver')
ok(cardRow.includes('break-words min-w-0'), 'kortet kan stadig krympe')
ok(!cardRow.includes(id), 'kortet er ikke hovedet')
ok(!cardRow.includes('\n'), 'kortets vindue har ikke linjeskift')
const aftercalc = readFileSync('src/app/dashboard/orders/[id]/case-aftercalc-panel.tsx', 'utf8')
const offered = readFileSync('src/app/dashboard/orders/[id]/case-offer-vs-actual-panel.tsx', 'utf8')
ok(aftercalc.split(bare).length === 2, 'sagspanelet har sit eget hoved')
ok(offered.split(bare).length === 2, 'afvigelsespanelet har sit eget hoved')
ok(!aftercalc.includes(id) && !offered.includes(id), 'de andre paneler har ikke hovedets testid')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-card-head-wrap-test')
