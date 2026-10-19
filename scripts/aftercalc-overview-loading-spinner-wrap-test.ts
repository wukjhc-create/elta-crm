/**
 * Indlaesnings-spinneren paa efterkalkulation kan krympe. Teksten Henter bliver.
 *   npx tsx scripts/aftercalc-overview-loading-spinner-wrap-test.ts
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
const id = 'data-testid="aftercalc-overview-loading-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-4 h-4 animate-spin" />'
const cell = '<Loader2 className="w-4 h-4 animate-spin break-words min-w-0" data-testid="aftercalc-overview-loading-spinner" />'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('w-4 h-4 animate-spin'), 'stoerrelsen bliver')
ok(!row.includes('Henter'), 'teksten er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare spinner er vaek')
ok(view.includes('> Henter…</p>'), 'teksten Henter bliver')
ok(view.includes('{loading && !data &&'), 'den vises kun mens der hentes')
ok(view.includes('data-testid="aftercalc-overview-loading"'), 'venteteksten bliver')
ok(view.split('data-testid="aftercalc-overview-loading"').length === 2, 'venteteksten findes en gang')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const para = 'data-testid="aftercalc-overview-loading"'
const start = view.indexOf(para)
const look = start >= 0 ? view.slice(start - 80, start + 200) : ''
ok(look.includes('> Henter…</p>'), 'ventevinduet naar teksten')
ok(look.includes(id), 'ventevinduet naar spinneren')
ok(!look.slice(0, 80).includes('Loader2'), 'tilbageblikket er ikke spinneren')
const closedAt = view.indexOf('data-testid="aftercalc-fold-closed-icon"')
const closedRow = closedAt >= 0 ? view.slice(closedAt - 68, closedAt + 10) : ''
ok(closedRow.startsWith('<ChevronRight'), 'fold-ind-vinduet bliver')
ok(!closedRow.includes(id), 'fold-ind er ikke spinneren')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-loading-spinner-wrap-test')
