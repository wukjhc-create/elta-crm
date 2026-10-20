/**
 * Kolonnen Faktisk DB % paa efterkalkulationens skrivebord kan krympe. Procenten bliver.
 *   npx tsx scripts/aftercalc-overview-actual-db-column-wrap-test.ts
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
const id = '>Faktisk DB %</th>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 58, at + 10) : ''
ok(row.startsWith('<th'), 'det er kolonnen Faktisk DB %')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('text-right'), 'hoejrestillingen bliver')
ok(row.endsWith('>Faktisk D'), 'etiketten bliver')
ok(!row.includes('Tilbudt'), 'tilbudt-kolonnen er et andet sted')
ok(!row.includes('afvigelse'), 'afvigelseskolonnen er et andet sted')
ok(!row.includes('actual_db_pct'), 'procenten er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split('<th className="px-2 py-1.5 text-right">Faktisk DB %</th>').length === 1, 'den bare kolonne er vaek')
ok(view.includes('<td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{pct(r.actual_db_pct)}</td>'), 'procenten bliver')
ok(view.includes('<th className="px-2 py-1.5 text-right">DB-afvigelse</th>'), 'afvigelseskolonnen bliver')
ok(view.includes('<dt className="text-gray-500 break-words min-w-0">Faktisk DB</dt>'), 'mobil-etiketten kan stadig krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const quoted = '>Tilbudt DB %</th>'
const qat = view.indexOf(quoted)
const qrow = qat >= 0 ? view.slice(qat - 58, qat + 10) : ''
ok(qrow.startsWith('<th'), 'tilbudt-db-vinduet bliver')
ok(qrow.includes('break-words min-w-0'), 'tilbudt-db kan stadig krympe')
ok(qrow.endsWith('>Tilbudt D'), 'tilbudt-db-etiketten bliver')
ok(!qrow.includes('Faktisk'), 'tilbudt-db-vinduet er ikke faktisk')
ok(!qrow.includes('\n'), 'tilbudt-db-vinduet har ikke linjeskift')
ok(!qrow.includes('\r'), 'tilbudt-db-vinduet har ikke vognretur')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-actual-db-column-wrap-test')
