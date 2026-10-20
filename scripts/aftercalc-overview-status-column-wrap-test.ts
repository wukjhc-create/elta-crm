/**
 * Kolonnen Status paa efterkalkulationens skrivebord kan krympe. Sagsstatus bliver.
 *   npx tsx scripts/aftercalc-overview-status-column-wrap-test.ts
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
const id = '>Status</th>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
ok(row.startsWith('<th'), 'det er kolonnen Status')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('text-left'), 'venstrestillingen bliver')
ok(row.endsWith('>Status</t'), 'etiketten bliver')
ok(!row.includes('</span>'), 'filteretiketten er et andet sted')
ok(!row.includes('Ansvarlig'), 'ansvarligkolonnen er et andet sted')
ok(!row.includes('Datakvalitet'), 'datakvalitet er et andet sted')
ok(!row.includes('SERVICE_CASE_STATUS_LABELS'), 'sagsstatus er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split('>Status</span>').length === 2, 'filteretiketten bliver')
ok(view.split('<th className="px-2 py-1.5 text-left">Status</th>').length === 1, 'den bare kolonne er vaek')
ok(view.includes('<th className="px-2 py-1.5 text-left">Datakvalitet</th>'), 'datakvalitet-kolonnen bliver')
ok(view.includes('<td className="px-2 py-1.5 text-gray-700 break-words min-w-0">{SERVICE_CASE_STATUS_LABELS[r.status as ServiceCaseStatus] ?? r.status}'), 'sagsstatus bliver')
ok(view.includes('data-testid="aftercalc-mobile-status"'), 'mobilstatus bliver')
ok(view.includes('<th className="px-2 py-1.5 text-right">DB-afvigelse</th>'), 'afvigelseskolonnen bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const ans = '>Ansvarlig</th>'
const aat = view.indexOf(ans)
const arow = aat >= 0 ? view.slice(aat - 57, aat + 10) : ''
ok(arow.startsWith('<th'), 'ansvarlig-vinduet bliver')
ok(arow.includes('break-words min-w-0'), 'ansvarlig kan stadig krympe')
ok(arow.endsWith('>Ansvarlig'), 'ansvarlig-etiketten bliver')
ok(!arow.includes('Status'), 'ansvarlig-vinduet er ikke status')
ok(!arow.includes('\n'), 'ansvarlig-vinduet har ikke linjeskift')
ok(!arow.includes('\r'), 'ansvarlig-vinduet har ikke vognretur')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-status-column-wrap-test')
