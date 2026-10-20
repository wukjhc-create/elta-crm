/**
 * Etiketten Faktisk omsaetning paa efterkalkulation kan krympe. Beloeget bliver.
 *   npx tsx scripts/aftercalc-overview-actual-revenue-label-wrap-test.ts
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
const id = '>Faktisk omsætning</dt>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 49, at + 10) : ''
const bare = '<dt className="text-gray-500">'
ok(row.startsWith('<dt'), 'det er etiketten Faktisk omsætning')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('actual_revenue'), 'beloebet er et andet sted')
ok(!row.includes('<th'), 'kolonnen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 1, 'ingen bare mobil-etiket er tilbage')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{kr(r.actual_revenue)}</dd>'), 'beloebet kan krympe')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Faktisk omsætning</th>'), 'skrivebordskolonnen kan krympe')
ok(view.includes('<dt className="text-gray-500 break-words min-w-0">Tilbudt DB</dt>'), 'tilbudt-db kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const quoted = '>Tilbudt omsætning</dt>'
const qat = view.indexOf(quoted)
const qrow = qat >= 0 ? view.slice(qat - 49, qat + 10) : ''
ok(qrow.startsWith('<dt'), 'tilbudt-omsaetningens vindue bliver')
ok(qrow.includes('break-words min-w-0'), 'tilbudt-omsaetning kan stadig krympe')
ok(!qrow.includes('Faktisk'), 'tilbudt-omsaetning er ikke faktisk')
ok(!qrow.includes('\n'), 'tilbudt-omsaetningens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-actual-revenue-label-wrap-test')
