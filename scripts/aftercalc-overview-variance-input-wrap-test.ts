/**
 * Afvigelse-feltet paa efterkalkulation kan krympe. De andre filtre bliver.
 *   npx tsx scripts/aftercalc-overview-variance-input-wrap-test.ts
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
const id = '<select value={(filters.variance ?? \'all\') as AftercalcVarianceFilter} onChange={(e) => setFilter({ variance: e.target.value as AftercalcVarianceFilter })} className="mt-0.5 w-full break-words min-w-0 max-w-full rounded border border-gray-300 px-2 py-1">'
const bare = '<select value={(filters.variance ?? \'all\') as AftercalcVarianceFilter} onChange={(e) => setFilter({ variance: e.target.value as AftercalcVarianceFilter })} className="mt-0.5 w-full min-w-0 max-w-full rounded border border-gray-300 px-2 py-1">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<select'), 'det er afvigelse')
ok(row.includes('break-words min-w-0'), 'feltet kan krympe')
ok(row.includes('setFilter({ variance: e.target.value as AftercalcVarianceFilter })'), 'afvigelsesfilteret bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('filters.sort'), 'sortering er et andet sted')
ok(!row.includes('varianceText'), 'afvigelsesteksten er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'feltet findes en gang')
ok(view.split(bare).length === 1, 'det bare afvigelse-felt er vaek')
ok(view.includes('value={filters.status ?? \'\'} onChange={(e) => setFilter({ status: e.target.value || null })} className="mt-0.5 w-full break-words min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"'), 'status kan krympe')
ok(view.includes('value={(filters.sort ?? \'worst_db\') as AftercalcSort} onChange={(e) => setFilter({ sort: e.target.value as AftercalcSort })} className="mt-0.5 w-full break-words min-w-0 max-w-full rounded border border-gray-300 px-2 py-1"'), 'sortering kan krympe')
ok(view.includes('>Afvigelse</span>'), 'etiketten bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-variance-input-wrap-test')
