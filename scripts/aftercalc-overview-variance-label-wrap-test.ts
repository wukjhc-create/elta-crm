/**
 * Etiketten Afvigelse paa efterkalkulation kan krympe. Filteret og beloebene bliver.
 *   npx tsx scripts/aftercalc-overview-variance-label-wrap-test.ts
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
const id = '>Afvigelse</span>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 59, at + 10) : ''
const bare = 'className="text-xs text-gray-500"'
ok(row.startsWith('<span'), 'det er etiketten Afvigelse')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('filters.variance'), 'filteret er et andet sted')
ok(!row.includes('varianceFilterLabel'), 'filterteksten er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 2, 'den anden etiket beholder den bare klasse')
ok(view.includes('<span className="text-xs text-gray-500">Sortering</span>'), 'sortering-etiketten bliver')
ok(view.includes("value={(filters.variance ?? 'all') as AftercalcVarianceFilter}"), 'afvigelsesfilteret bliver')
ok(view.includes('data-testid="aftercalc-variance-filter"'), 'filterteksten bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const status = '>Status</span>'
const sat = view.indexOf(status)
const srow = sat >= 0 ? view.slice(sat - 59, sat + 10) : ''
ok(srow.startsWith('<span'), 'status-etikettens vindue bliver')
ok(srow.includes('break-words min-w-0'), 'status-etiketten kan stadig krympe')
ok(!srow.includes('Afvigelse'), 'status-etiketten er ikke afvigelse')
ok(!srow.includes('\n'), 'status-etikettens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-variance-label-wrap-test')
