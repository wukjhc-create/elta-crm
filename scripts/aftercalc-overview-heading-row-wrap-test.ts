/**
 * Overskriftens raekke paa efterkalkulation kan krympe. Teksten bliver.
 *   npx tsx scripts/aftercalc-overview-heading-row-wrap-test.ts
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
const id = 'data-testid="aftercalc-overview-heading-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 86, at + 10) : ''
const bare = '<div className="flex flex-wrap items-start justify-between gap-3">'
const cell = '<div className="flex flex-wrap items-start justify-between gap-3 break-words min-w-0" data-testid="aftercalc-overview-heading-row">'
ok(row.startsWith('<div'), 'det er raekken')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('flex flex-wrap items-start justify-between gap-3'), 'raekken bliver en raekke')
ok(!row.includes('Efterkalkulation'), 'overskriften er et andet sted')
ok(!row.includes('Tilbudt'), 'indledningen er et andet sted')
ok(!row.includes('Fra dato'), 'filtret er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare raekke er vaek')
ok(view.includes('>Efterkalkulation</h1>'), 'teksten bliver')
ok(view.includes('data-testid="aftercalc-overview-title"'), 'overskriften bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
ok(view.includes('<div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">'), 'filterkortet bliver')
ok(view.includes('data-testid="aftercalc-view-count"'), 'sagstaellingen bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const titleAt = view.indexOf('data-testid="aftercalc-overview-title"')
const titleRow = titleAt >= 0 ? view.slice(titleAt - 69, titleAt + 10) : ''
ok(titleRow.startsWith('<h1'), 'overskriftens vindue bliver')
ok(!titleRow.includes(id), 'overskriften er ikke raekken')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-heading-row-wrap-test')
