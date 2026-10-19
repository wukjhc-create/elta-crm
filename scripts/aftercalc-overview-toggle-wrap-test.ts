/**
 * Sager-knappen paa efterkalkulation kan krympe. Teksten Sager og filtrene bliver.
 *   npx tsx scripts/aftercalc-overview-toggle-wrap-test.ts
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
const id = 'data-testid="aftercalc-overview-toggle"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 122, at + 10) : ''
const bare = '<button type="button" onClick={toggle} className="w-full flex items-center justify-between text-left" data-testid="aftercalc-overview-toggle"'
const cell = '<button type="button" onClick={toggle} className="w-full flex items-center justify-between text-left break-words min-w-0" data-testid="aftercalc-overview-toggle"'
ok(row.startsWith('<button'), 'det er knappen')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('w-full flex items-center justify-between text-left'), 'raekken bliver')
ok(!row.includes('Sager'), 'teksten er et andet sted')
ok(!row.includes('Fra dato'), 'filtret er et andet sted')
ok(!row.includes('Efterkalkulation'), 'overskriften er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare knap er vaek')
ok(view.includes('aria-expanded={open}'), 'aaben-tilstanden bliver')
ok(view.includes('onClick={toggle}'), 'klikket bliver')
ok(view.includes('<h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">'), 'sager-overskriften bliver')
ok(view.includes('Sager'), 'teksten Sager bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('onChange={(e) => setFilter({ from: e.target.value || null })}'), 'fra-dato-handlingen bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
ok(view.includes('<div className="rounded-lg ring-1 ring-gray-200 bg-white p-4 break-words min-w-0" data-testid="aftercalc-overview-filter-card">'), 'filterkortet kan krympe')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const cardAt = view.indexOf('data-testid="aftercalc-overview-filter-card"')
const cardRow = cardAt >= 0 ? view.slice(cardAt - 82, cardAt + 10) : ''
ok(cardRow.startsWith('<div'), 'kortets vindue bliver')
ok(!cardRow.includes(id), 'kortet er ikke knappen')
const headingAt = view.indexOf('data-testid="aftercalc-overview-heading-row"')
const headingRow = headingAt >= 0 ? view.slice(headingAt - 86, headingAt + 10) : ''
ok(headingRow.startsWith('<div'), 'raekkens vindue bliver')
ok(!headingRow.includes(id), 'raekken er ikke knappen')
const titleAt = view.indexOf('data-testid="aftercalc-overview-title"')
const titleRow = titleAt >= 0 ? view.slice(titleAt - 69, titleAt + 10) : ''
ok(titleRow.startsWith('<h1'), 'overskriftens vindue bliver')
const introAt = view.indexOf('data-testid="aftercalc-overview-intro"')
const intro = introAt >= 0 ? view.slice(introAt - 50, introAt + 120) : ''
ok(!intro.includes(id), 'indledningen er ikke knappen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-toggle-wrap-test')
