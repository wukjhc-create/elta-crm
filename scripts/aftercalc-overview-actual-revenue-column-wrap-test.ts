/**
 * Kolonnen Faktisk omsaetning paa efterkalkulationens skrivebord kan krympe. Beloeget bliver.
 *   npx tsx scripts/aftercalc-overview-actual-revenue-column-wrap-test.ts
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
const id = '>Faktisk omsætning</th>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 58, at + 10) : ''
ok(row.startsWith('<th'), 'det er kolonnen Faktisk omsætning')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('text-right'), 'hoejrestillingen bliver')
ok(row.endsWith('>Faktisk o'), 'etiketten bliver')
ok(!row.includes('Tilbudt'), 'tilbudt-kolonnen er et andet sted')
ok(!row.includes('actual_revenue'), 'beloebet er et andet sted')
ok(!row.includes('text-left'), 'venstrestillingen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split('<th className="px-2 py-1.5 text-right">Faktisk omsætning</th>').length === 1, 'den bare kolonne er vaek')
ok(view.includes('<td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{kr(r.actual_revenue)}</td>'), 'beloebet bliver')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Tilbudt DB %</th>'), 'tilbudt-db-kolonnen kan krympe')
ok(view.includes('<dt className="text-gray-500 break-words min-w-0">Faktisk omsætning</dt>'), 'mobil-etiketten kan stadig krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const quoted = '>Tilbudt omsætning</th>'
const qat = view.indexOf(quoted)
const qrow = qat >= 0 ? view.slice(qat - 58, qat + 10) : ''
ok(qrow.startsWith('<th'), 'tilbudt-omsaetning-vinduet bliver')
ok(qrow.includes('break-words min-w-0'), 'tilbudt-omsaetning kan stadig krympe')
ok(qrow.endsWith('>Tilbudt o'), 'tilbudt-omsaetning-etiketten bliver')
ok(!qrow.includes('Faktisk'), 'tilbudt-omsaetning-vinduet er ikke faktisk')
ok(!qrow.includes('\n'), 'tilbudt-omsaetning-vinduet har ikke linjeskift')
ok(!qrow.includes('\r'), 'tilbudt-omsaetning-vinduet har ikke vognretur')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-actual-revenue-column-wrap-test')
