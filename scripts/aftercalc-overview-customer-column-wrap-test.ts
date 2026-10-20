/**
 * Kolonnen Kunde paa efterkalkulationens skrivebord kan krympe. Navnet bliver.
 *   npx tsx scripts/aftercalc-overview-customer-column-wrap-test.ts
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
const id = '>Kunde</th>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
ok(row.startsWith('<th'), 'det er kolonnen Kunde')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('text-left'), 'venstrestillingen bliver')
ok(row.endsWith('>Kunde</th'), 'etiketten bliver')
ok(!row.includes('Sag'), 'sagkolonnen er et andet sted')
ok(!row.includes('Ansvarlig'), 'ansvarligkolonnen er et andet sted')
ok(!row.includes('customer_name'), 'navnet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split('<th className="px-2 py-1.5 text-left">Kunde</th>').length === 1, 'den bare kolonne er vaek')
ok(view.includes('<th className="px-2 py-1.5 text-left break-words min-w-0">Ansvarlig</th>'), 'ansvarlig-kolonnen kan krympe')
ok(view.includes('<td className="px-2 py-1.5 text-gray-800 break-words">{r.customer_name || \'—\'}</td>'), 'kundenavnet bliver')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Tilbudt omsætning</th>'), 'tilbudt-omsaetning-kolonnen kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const sag = '>Sag</th>'
const sat = view.indexOf(sag)
const srow = sat >= 0 ? view.slice(sat - 57, sat + 9) : ''
ok(srow.startsWith('<th'), 'sag-vinduet bliver')
ok(srow.includes('break-words min-w-0'), 'sag kan stadig krympe')
ok(srow.endsWith('>Sag</th>'), 'sag-etiketten bliver')
ok(!srow.includes('Kunde'), 'sag-vinduet er ikke kunde')
ok(!srow.includes('\n'), 'sag-vinduet har ikke linjeskift')
ok(!srow.includes('\r'), 'sag-vinduet har ikke vognretur')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-customer-column-wrap-test')
