/**
 * Fold-ind-ikonet paa efterkalkulation kan krympe. ChevronDown og teksten Sager bliver.
 *   npx tsx scripts/aftercalc-overview-fold-closed-icon-wrap-test.ts
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
const id = 'data-testid="aftercalc-fold-closed-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 68, at + 10) : ''
const bare = '<ChevronRight className="w-4 h-4 text-gray-500" />'
const cell = '<ChevronRight className="w-4 h-4 text-gray-500 break-words min-w-0" data-testid="aftercalc-fold-closed-icon" />'
ok(row.startsWith('<ChevronRight'), 'det er fold-ind')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('w-4 h-4 text-gray-500'), 'stoerrelsen bliver')
ok(!row.includes('ChevronDown'), 'fold-ud er et andet sted')
ok(!row.includes('Sager'), 'teksten er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('{open ?'), 'foldet bliver')
ok(view.includes('<ChevronDown className="w-4 h-4 text-gray-500 break-words min-w-0" data-testid="aftercalc-fold-open-icon" />'), 'fold-ud kan krympe')
ok(view.includes('Sager'), 'teksten Sager bliver')
ok(view.includes('<Loader2 className="w-4 h-4 animate-spin" />'), 'indlaesnings-spinneren bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const openAt = view.indexOf('data-testid="aftercalc-fold-open-icon"')
const openRow = openAt >= 0 ? view.slice(openAt - 67, openAt + 10) : ''
ok(openRow.startsWith('<ChevronDown'), 'fold-ud-vinduet bliver')
ok(!openRow.includes(id), 'fold-ud er ikke fold-ind')
const iconAt = view.indexOf('data-testid="aftercalc-sager-icon"')
const iconRow = iconAt >= 0 ? view.slice(iconAt - 61, iconAt + 10) : ''
ok(iconRow.startsWith('<Scale'), 'sager-ikonets vindue bliver')
ok(!iconRow.includes(id), 'sager-ikonet er ikke fold-ind')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-fold-closed-icon-wrap-test')
