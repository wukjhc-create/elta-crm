/**
 * Etiketten Status paa efterkalkulation kan krympe. Filteret og sagsstatus bliver.
 *   npx tsx scripts/aftercalc-overview-status-label-wrap-test.ts
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
const id = '>Status</span>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 59, at + 10) : ''
const bare = 'className="text-xs text-gray-500"'
ok(row.startsWith('<span'), 'det er etiketten Status')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('filters.status'), 'filteret er et andet sted')
ok(!row.includes('SERVICE_CASE_STATUS_LABELS'), 'sagsstatus er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes('<span className="text-xs text-gray-500 break-words min-w-0">Afvigelse</span>'), 'afvigelse-etiketten kan krympe')
ok(view.includes("value={filters.status ?? ''}"), 'status-filteret bliver')
ok(view.includes('data-testid="aftercalc-mobile-status"'), 'mobilstatus bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const ansvarlig = '>Ansvarlig</span>'
const aat = view.indexOf(ansvarlig)
const arow = aat >= 0 ? view.slice(aat - 59, aat + 10) : ''
ok(arow.startsWith('<span'), 'ansvarlig-etikettens vindue bliver')
ok(arow.includes('break-words min-w-0'), 'ansvarlig-etiketten kan stadig krympe')
ok(!arow.includes('Status'), 'ansvarlig-etiketten er ikke status')
ok(!arow.includes('\n'), 'ansvarlig-etikettens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-status-label-wrap-test')
