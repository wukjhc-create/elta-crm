/**
 * Filtergitteret paa efterkalkulation kan krympe. Datofiltre og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-filter-grid-wrap-test.ts
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
const id = '<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm break-words min-w-0">'
const bare = '<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm min-w-0">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<div'), 'det er filtergitteret')
ok(row.includes('break-words min-w-0'), 'gitteret kan krympe')
ok(row.includes('grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6'), 'kolonnerne bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('Fra dato'), 'etiketten er et andet sted')
ok(!row.includes('filters.from'), 'datofeltet er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'gitteret findes en gang')
ok(view.split(bare).length === 1, 'det bare gitter er vaek')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('value={filters.from ?? \'\'}'), 'fra-filteret bliver')
ok(view.includes('className="mt-0.5 w-full break-words min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"'), 'datofelterne kan krympe')
ok(view.includes('<div className="mt-3 space-y-3 break-words min-w-0">'), 'filterindholdet kan stadig krympe')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-filter-grid-wrap-test')
