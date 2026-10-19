/**
 * Fold-ud-ikonet paa efterkalkulation kan krympe. ChevronRight og teksten Sager bliver.
 *   npx tsx scripts/aftercalc-overview-fold-open-icon-wrap-test.ts
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
const id = 'data-testid="aftercalc-fold-open-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 67, at + 10) : ''
const bare = '<ChevronDown className="w-4 h-4 text-gray-500" />'
const cell = '<ChevronDown className="w-4 h-4 text-gray-500 break-words min-w-0" data-testid="aftercalc-fold-open-icon" />'
ok(row.startsWith('<ChevronDown'), 'det er fold-ud')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('w-4 h-4 text-gray-500'), 'stoerrelsen bliver')
ok(!row.includes('ChevronRight'), 'fold-ind er et andet sted')
ok(!row.includes('Sager'), 'teksten er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('{open ?'), 'foldet bliver')
ok(view.includes('<ChevronRight className="w-4 h-4 text-gray-500 break-words min-w-0" data-testid="aftercalc-fold-closed-icon" />'), 'fold-ind kan krympe')
ok(view.includes('Sager'), 'teksten Sager bliver')
ok(view.includes('data-testid="aftercalc-sager-icon"'), 'sager-ikonet bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const iconAt = view.indexOf('data-testid="aftercalc-sager-icon"')
const iconRow = iconAt >= 0 ? view.slice(iconAt - 61, iconAt + 10) : ''
ok(iconRow.startsWith('<Scale'), 'sager-ikonets vindue bliver')
ok(!iconRow.includes(id), 'sager-ikonet er ikke fold-ud')
const headingAt = view.indexOf('data-testid="aftercalc-sager-heading"')
const headingRow = headingAt >= 0 ? view.slice(headingAt - 96, headingAt + 10) : ''
ok(headingRow.startsWith('<h2'), 'overskriftens vindue bliver')
ok(!headingRow.includes(id), 'overskriften er ikke fold-ud')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-fold-open-icon-wrap-test')
