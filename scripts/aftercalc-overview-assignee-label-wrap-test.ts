/**
 * Etiketten Ansvarlig paa efterkalkulation kan krympe. Filteret og navnet bliver.
 *   npx tsx scripts/aftercalc-overview-assignee-label-wrap-test.ts
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
const id = '>Ansvarlig</span>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 59, at + 10) : ''
const bare = 'className="text-xs text-gray-500"'
ok(row.startsWith('<span'), 'det er etiketten Ansvarlig')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('filters.assigneeId'), 'filteret er et andet sted')
ok(!row.includes('assignee_name'), 'navnet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 3, 'de andre etiketter beholder den bare klasse')
ok(view.includes('<span className="text-xs text-gray-500 break-words min-w-0">Status</span>'), 'status-etiketten kan krympe')
ok(view.includes('Ansvarlig: {r.assignee_name || \'—\'}'), 'navnelinjen bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const til = '>Til dato</span>'
const tat = view.indexOf(til)
const trow = tat >= 0 ? view.slice(tat - 59, tat + 10) : ''
ok(trow.startsWith('<span'), 'til-datoens vindue bliver')
ok(trow.includes('break-words min-w-0'), 'til-datoen kan stadig krympe')
ok(!trow.includes('Ansvarlig'), 'til-datoen er ikke etiketten')
ok(!trow.includes('\n'), 'til-datoens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-assignee-label-wrap-test')
