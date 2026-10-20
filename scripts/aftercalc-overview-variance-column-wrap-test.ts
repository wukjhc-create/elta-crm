/**
 * Kolonnen DB-afvigelse paa efterkalkulationens skrivebord kan krympe. Afvigelsen bliver.
 *   npx tsx scripts/aftercalc-overview-variance-column-wrap-test.ts
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
const id = '>DB-afvigelse</th>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 58, at + 10) : ''
ok(row.startsWith('<th'), 'det er kolonnen DB-afvigelse')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('text-right'), 'hoejrestillingen bliver')
ok(row.endsWith('>DB-afvige'), 'etiketten bliver')
ok(!row.includes('Faktisk'), 'faktisk-kolonnen er et andet sted')
ok(!row.includes('Status'), 'statuskolonnen er et andet sted')
ok(!row.includes('varianceText'), 'afvigelsen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split('<th className="px-2 py-1.5 text-right">DB-afvigelse</th>').length === 1, 'den bare kolonne er vaek')
ok(view.includes('{varianceText(r.db_variance, r.db_variance_pct_points)}'), 'afvigelsen bliver')
ok(view.includes('<table className="w-full text-sm">'), 'tabellen bliver')
ok(view.includes('<th className="px-2 py-1.5 text-left break-words min-w-0">Status</th>'), 'statuskolonnen kan stadig krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const faktisk = '>Faktisk DB %</th>'
const fat = view.indexOf(faktisk)
const frow = fat >= 0 ? view.slice(fat - 58, fat + 10) : ''
ok(frow.startsWith('<th'), 'faktisk-db-vinduet bliver')
ok(frow.includes('break-words min-w-0'), 'faktisk-db kan stadig krympe')
ok(frow.endsWith('>Faktisk D'), 'faktisk-db-etiketten bliver')
ok(!frow.includes('afvigelse'), 'faktisk-db-vinduet er ikke afvigelse')
ok(!frow.includes('\n'), 'faktisk-db-vinduet har ikke linjeskift')
ok(!frow.includes('\r'), 'faktisk-db-vinduet har ikke vognretur')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-variance-column-wrap-test')
