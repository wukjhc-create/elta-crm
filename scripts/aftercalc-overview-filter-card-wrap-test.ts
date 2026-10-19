/**
 * Filterkortet paa efterkalkulation kan krympe. Filtre, beloeb og overskriften bliver.
 *   npx tsx scripts/aftercalc-overview-filter-card-wrap-test.ts
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
const id = 'data-testid="aftercalc-overview-filter-card"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 82, at + 10) : ''
const bare = '<div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">'
const cell = '<div className="rounded-lg ring-1 ring-gray-200 bg-white p-4 break-words min-w-0" data-testid="aftercalc-overview-filter-card">'
ok(row.startsWith('<div'), 'det er kortet')
ok(row.includes('break-words min-w-0'), 'kortet kan krympe')
ok(row.includes('rounded-lg ring-1 ring-gray-200 bg-white p-4'), 'ringen bliver')
ok(!row.includes('Fra dato'), 'filtret er et andet sted')
ok(!row.includes('Efterkalkulation'), 'overskriften er et andet sted')
ok(!row.includes('Sager'), 'knappen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kortet findes en gang')
ok(view.split(cell).length === 2, 'kortklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare kort er vaek')
ok(view.includes('>Efterkalkulation</h1>'), 'teksten bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
ok(view.includes('<div className="flex flex-wrap items-start justify-between gap-3 break-words min-w-0" data-testid="aftercalc-overview-heading-row">'), 'raekken kan krympe')
ok(view.includes('data-testid="aftercalc-view-count"'), 'sagstaellingen bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('onChange={(e) => setFilter({ from: e.target.value || null })}'), 'fra-dato-handlingen bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('data-testid="aftercalc-overview-toggle"'), 'sager-knappen bliver')
ok(view.includes('<h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">'), 'sager-overskriften bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const headingAt = view.indexOf('data-testid="aftercalc-overview-heading-row"')
const headingRow = headingAt >= 0 ? view.slice(headingAt - 86, headingAt + 10) : ''
ok(headingRow.startsWith('<div'), 'raekkens vindue bliver')
ok(!headingRow.includes(id), 'raekken er ikke kortet')
const titleAt = view.indexOf('data-testid="aftercalc-overview-title"')
const titleRow = titleAt >= 0 ? view.slice(titleAt - 69, titleAt + 10) : ''
ok(titleRow.startsWith('<h1'), 'overskriftens vindue bliver')
ok(!titleRow.includes(id), 'overskriften er ikke kortet')
const introAt = view.indexOf('data-testid="aftercalc-overview-intro"')
const intro = introAt >= 0 ? view.slice(introAt - 50, introAt + 120) : ''
ok(!intro.includes(id), 'indledningen er ikke kortet')
ok(intro.includes('break-words min-w-0" data-testid="aftercalc-overview-intro">Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'indledningen kan stadig krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-filter-card-wrap-test')
