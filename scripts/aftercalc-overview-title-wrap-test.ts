/**
 * Overskriften Efterkalkulation kan krympe. Teksten og beloebene bliver.
 *   npx tsx scripts/aftercalc-overview-title-wrap-test.ts
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
const id = 'data-testid="aftercalc-overview-title"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 69, at + 10) : ''
const bare = '<h1 className="text-2xl font-bold text-gray-900">Efterkalkulation</h1>'
const cell = '<h1 className="text-2xl font-bold text-gray-900 break-words min-w-0" data-testid="aftercalc-overview-title">Efterkalkulation</h1>'
ok(row.startsWith('<h1'), 'det er overskriften')
ok(row.includes('break-words min-w-0'), 'overskriften kan krympe')
ok(row.includes('text-2xl font-bold text-gray-900'), 'stoerrelsen bliver')
ok(!row.includes('Efterkalkulation'), 'teksten er et andet sted')
ok(!row.includes('Tilbudt'), 'indledningen er et andet sted')
ok(!row.includes('Fra dato'), 'filtret er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'overskriften findes en gang')
ok(view.split(cell).length === 2, 'overskriftsklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare overskrift er vaek')
ok(view.includes('>Efterkalkulation</h1>'), 'teksten bliver')
ok(view.includes('data-testid="aftercalc-overview-intro"'), 'indledningen bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
ok(view.includes('<div className="flex flex-wrap items-start justify-between gap-3">'), 'raekken bliver')
ok(view.includes('data-testid="aftercalc-view-count"'), 'sagstaellingen bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const introAt = view.indexOf('data-testid="aftercalc-overview-intro"')
const intro = introAt >= 0 ? view.slice(introAt - 50, introAt + 120) : ''
ok(!intro.includes(id), 'indledningen er ikke overskriften')
ok(intro.includes('break-words min-w-0" data-testid="aftercalc-overview-intro">Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'indledningen kan stadig krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-title-wrap-test')
