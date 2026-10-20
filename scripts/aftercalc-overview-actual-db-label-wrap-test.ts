/**
 * Etiketten Faktisk DB paa efterkalkulation kan krympe. Procenten bliver.
 *   npx tsx scripts/aftercalc-overview-actual-db-label-wrap-test.ts
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
const id = '>Faktisk DB</dt>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 49, at + 10) : ''
const bare = '<dt className="text-gray-500">'
ok(row.startsWith('<dt'), 'det er etiketten Faktisk DB')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('actual_db_pct'), 'procenten er et andet sted')
ok(!row.includes('<th'), 'kolonnen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words">{pct(r.actual_db_pct)}</dd>'), 'procenten bliver')
ok(view.includes('<th className="px-2 py-1.5 text-right">Faktisk DB %</th>'), 'skrivebordskolonnen bliver')
ok(view.includes('<th className="px-2 py-1.5 text-left break-words min-w-0">Sag</th>'), 'sag-kolonnen kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const quoted = '>Tilbudt DB</dt>'
const qat = view.indexOf(quoted)
const qrow = qat >= 0 ? view.slice(qat - 49, qat + 10) : ''
ok(qrow.startsWith('<dt'), 'tilbudt-db-vinduet bliver')
ok(qrow.includes('break-words min-w-0'), 'tilbudt-db kan stadig krympe')
ok(!qrow.includes('Faktisk'), 'tilbudt-db er ikke faktisk')
ok(!qrow.includes('\n'), 'tilbudt-db-vinduet har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-actual-db-label-wrap-test')
