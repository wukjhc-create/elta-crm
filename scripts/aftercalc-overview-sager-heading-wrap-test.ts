/**
 * Sager-overskriften paa efterkalkulation kan krympe. Teksten Sager og filtrene bliver.
 *   npx tsx scripts/aftercalc-overview-sager-heading-wrap-test.ts
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
const id = 'data-testid="aftercalc-sager-heading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 96, at + 10) : ''
const bare = '<h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">'
const cell = '<h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 break-words min-w-0" data-testid="aftercalc-sager-heading">'
ok(row.startsWith('<h2'), 'det er overskriften')
ok(row.includes('break-words min-w-0'), 'overskriften kan krympe')
ok(row.includes('text-sm font-semibold text-gray-900 flex items-center gap-2'), 'stoerrelsen bliver')
ok(!row.includes('Sager'), 'teksten er et andet sted')
ok(!row.includes('Scale'), 'ikonet er et andet sted')
ok(!row.includes('Fra dato'), 'filtret er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'overskriften findes en gang')
ok(view.split(cell).length === 2, 'overskriftsklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare overskrift er vaek')
ok(view.includes('Sager'), 'teksten Sager bliver')
ok(view.includes('<Scale className="w-4 h-4 text-gray-500" />'), 'sager-ikonet bliver')
ok(view.includes('data-testid="aftercalc-overview-toggle"'), 'sager-knappen bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const toggleAt = view.indexOf('data-testid="aftercalc-overview-toggle"')
const toggleRow = toggleAt >= 0 ? view.slice(toggleAt - 122, toggleAt + 10) : ''
ok(toggleRow.startsWith('<button'), 'knappens vindue bliver')
ok(!toggleRow.includes(id), 'knappen er ikke overskriften')
const cardAt = view.indexOf('data-testid="aftercalc-overview-filter-card"')
const cardRow = cardAt >= 0 ? view.slice(cardAt - 82, cardAt + 10) : ''
ok(cardRow.startsWith('<div'), 'kortets vindue bliver')
ok(!cardRow.includes(id), 'kortet er ikke overskriften')
const titleAt = view.indexOf('data-testid="aftercalc-overview-title"')
const titleRow = titleAt >= 0 ? view.slice(titleAt - 69, titleAt + 10) : ''
ok(titleRow.startsWith('<h1'), 'sideoverskriftens vindue bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-sager-heading-wrap-test')
