/**
 * Filterindholdet paa efterkalkulation kan krympe. Filtre og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-filter-body-wrap-test.ts
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
const id = '<div className="mt-3 space-y-3 break-words min-w-0">'
const bare = '<div className="mt-3 space-y-3">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<div'), 'det er filterindholdet')
ok(row.includes('break-words min-w-0'), 'filterindholdet kan krympe')
ok(row.includes('mt-3 space-y-3'), 'afstanden bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('Fra dato'), 'datoen er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'filterindholdet findes en gang')
ok(view.split(bare).length === 1, 'det bare filterindhold er vaek')
ok(view.includes('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm min-w-0'), 'filtergitteret kan stadig krympe')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('>Til dato</span>'), 'til-dato bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('<tr key={r.case_id} data-testid="aftercalc-overview-row" data-quality={r.data_quality} className="break-words min-w-0">'), 'dataraekken kan stadig krympe')
ok(view.includes('<div className="flex items-center gap-2 break-words min-w-0" data-testid="aftercalc-pager">'), 'sidestyringen kan krympe')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige'), 'Forrige bliver 44 px')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-filter-body-wrap-test')
