/**
 * Kolonnen Ansvarlig paa efterkalkulationens skrivebord kan krympe. Navnet bliver.
 *   npx tsx scripts/aftercalc-overview-assignee-column-wrap-test.ts
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
const id = '>Ansvarlig</th>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
ok(row.startsWith('<th'), 'det er kolonnen Ansvarlig')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('text-left'), 'venstrestillingen bliver')
ok(row.endsWith('>Ansvarlig'), 'etiketten bliver')
ok(!row.includes('</span>'), 'filteretiketten er et andet sted')
ok(!row.includes('Kunde'), 'kundekolonnen er et andet sted')
ok(!row.includes('assignee_name'), 'navnet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split('<th className="px-2 py-1.5 text-left">Ansvarlig</th>').length === 1, 'den bare kolonne er vaek')
ok(view.includes('<th className="px-2 py-1.5 text-left break-words min-w-0">Status</th>'), 'status-kolonnen kan krympe')
ok(view.includes('<td className="px-2 py-1.5 text-gray-800 break-words min-w-0">{r.assignee_name || \'—\'}</td>'), 'navnet kan krympe')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Faktisk omsætning</th>'), 'faktisk-omsaetning-kolonnen kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const kunde = '>Kunde</th>'
const kat = view.indexOf(kunde)
const krow = kat >= 0 ? view.slice(kat - 57, kat + 10) : ''
ok(krow.startsWith('<th'), 'kunde-vinduet bliver')
ok(krow.includes('break-words min-w-0'), 'kunde kan stadig krympe')
ok(krow.endsWith('>Kunde</th'), 'kunde-etiketten bliver')
ok(!krow.includes('Ansvarlig'), 'kunde-vinduet er ikke ansvarlig')
ok(!krow.includes('\n'), 'kunde-vinduet har ikke linjeskift')
ok(!krow.includes('\r'), 'kunde-vinduet har ikke vognretur')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-assignee-column-wrap-test')
