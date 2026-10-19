/**
 * Sidevaelgeren paa efterkalkulation kan krympe. Teksten og filtrene bliver.
 *   npx tsx scripts/aftercalc-overview-pager-row-wrap-test.ts
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
const id = 'data-testid="aftercalc-pager-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 109, at + 10) : ''
const bare = '<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">'
const cell = '<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-pager-row">'
ok(row.startsWith('<div'), 'det er sidevaelgeren')
ok(row.includes('break-words min-w-0'), 'sidevaelgeren kan krympe')
ok(row.includes('flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500'), 'raekken bliver')
ok(!row.includes('Forrige'), 'knappen er et andet sted')
ok(!row.includes('sager'), 'taellingen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'sidevaelgeren findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'den bare raekke er vaek')
ok(view.split('data-testid="aftercalc-pager"').length === 2, 'den indre sidestyring bliver')
ok(view.includes('data-testid="aftercalc-view-count"'), 'sagstaellingen bliver')
ok(view.includes('{data.total} sager i visningen. Beregnet på {data.query_ms} ms.'), 'taelleteksten bliver')
ok(view.includes('data-testid="aftercalc-page-label"'), 'sidetallet bliver')
ok(view.includes('Side {data.page} af {pages}'), 'sideteksten bliver')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige'), 'Forrige bliver')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Næste'), 'Naeste bliver')
ok(view.includes('setFilter({ page: (data.page ?? 1) - 1 }, true)'), 'forrige side bliver')
ok(view.includes('setFilter({ page: (data.page ?? 1) + 1 }, true)'), 'naeste side bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const empty = 'data-testid="aftercalc-empty"'
const eat = view.indexOf(empty)
const emptyRow = eat >= 0 ? view.slice(eat - 59, eat + 10) : ''
ok(emptyRow.startsWith('<div'), 'tom-vinduet bliver')
ok(emptyRow.includes('break-words min-w-0'), 'den tomme tilstand kan stadig krympe')
ok(!emptyRow.includes(id), 'tom-vinduet er ikke sidevaelgeren')
const other = readFileSync('src/components/modules/orders/case-project-economy-card.tsx', 'utf8')
ok(other.includes('flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 pt-1'), 'sagsoekonomien har sin egen raekke')
ok(!other.includes(id), 'sagsoekonomien har ikke sidevaelgeren')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-pager-row-wrap-test')
