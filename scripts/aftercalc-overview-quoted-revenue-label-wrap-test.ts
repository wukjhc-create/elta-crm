/**
 * Etiketten Tilbudt omsaetning paa efterkalkulation kan krympe. Beloeget bliver.
 *   npx tsx scripts/aftercalc-overview-quoted-revenue-label-wrap-test.ts
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
const id = '>Tilbudt omsætning</dt>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 49, at + 10) : ''
const bare = '<dt className="text-gray-500">'
ok(row.startsWith('<dt'), 'det er etiketten Tilbudt omsætning')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('<th'), 'kolonnen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 1, 'ingen bare mobil-etiket er tilbage')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{kr(r.quoted_revenue)}</dd>'), 'beloebet kan krympe')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Tilbudt omsætning</th>'), 'skrivebordskolonnen kan krympe')
ok(view.includes('<dt className="text-gray-500 break-words min-w-0">Faktisk omsætning</dt>'), 'faktisk-omsaetning kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const sort = '>Sortering</span>'
const sat = view.indexOf(sort)
const srow = sat >= 0 ? view.slice(sat - 59, sat + 10) : ''
ok(srow.startsWith('<span'), 'sortering-etikettens vindue bliver')
ok(srow.includes('break-words min-w-0'), 'sortering-etiketten kan stadig krympe')
ok(!srow.includes('Tilbudt'), 'sortering-etiketten er ikke omsætning')
ok(!srow.includes('\n'), 'sortering-etikettens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-quoted-revenue-label-wrap-test')
