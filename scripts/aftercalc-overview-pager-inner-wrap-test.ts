/**
 * Sidestyringen paa efterkalkulation kan krympe. Knappernes 44 px og sideantallet bliver.
 *   npx tsx scripts/aftercalc-overview-pager-inner-wrap-test.ts
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
const id = '<div className="flex items-center gap-2 break-words min-w-0" data-testid="aftercalc-pager">'
const bare = '<div className="flex items-center gap-2" data-testid="aftercalc-pager">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<div'), 'det er sidestyringen')
ok(row.includes('break-words min-w-0'), 'sidestyringen kan krympe')
ok(row.includes('data-testid="aftercalc-pager"'), 'testid bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('Forrige'), 'knappen er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'sidestyringen findes en gang')
ok(view.split(bare).length === 1, 'den bare sidestyring er vaek')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige'), 'Forrige bliver 44 px')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Næste'), 'Naeste bliver 44 px')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('setFilter({ page: (data.page ?? 1) - 1 }, true)'), 'forrige side bliver')
ok(view.includes('setFilter({ page: (data.page ?? 1) + 1 }, true)'), 'naeste side bliver')
ok(view.includes('<div className="mt-3 space-y-3 break-words min-w-0">'), 'filterindholdet kan stadig krympe')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words">{kr(r.quoted_revenue)}</dd>'), 'tilbudt mobilbeloeb er stadig uden min-w-0')
ok(view.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beloeb bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-pager-inner-wrap-test')
