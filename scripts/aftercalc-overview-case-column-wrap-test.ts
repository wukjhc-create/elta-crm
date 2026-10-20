/**
 * Kolonnen Sag paa efterkalkulationens skrivebord kan krympe. Linket kan krympe.
 *   npx tsx scripts/aftercalc-overview-case-column-wrap-test.ts
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
const id = '>Sag</th>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 9) : ''
ok(row.startsWith('<th'), 'det er kolonnen Sag')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('text-left'), 'venstrestillingen bliver')
ok(row.endsWith('>Sag</th>'), 'etiketten bliver')
ok(!row.includes('Kunde'), 'kundekolonnen er et andet sted')
ok(!row.includes('case_number'), 'linket er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split('<th className="px-2 py-1.5 text-left">Sag</th>').length === 1, 'den bare kolonne er vaek')
ok(view.includes('<th className="px-2 py-1.5 text-left break-words min-w-0">Kunde</th>'), 'kundekolonnen kan krympe')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Tilbudt omsætning</th>'), 'tilbudt-omsaetning-kolonnen kan krympe')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Faktisk DB %</th>'), 'faktisk-db-kolonnen kan krympe')
ok(view.includes('<Link href={`/dashboard/orders/${r.case_id}?tab=oekonomi`} className="text-blue-700 hover:underline break-words min-w-0">'), 'linket kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const db = '>Faktisk DB</dt>'
const dat = view.indexOf(db)
const drow = dat >= 0 ? view.slice(dat - 49, dat + 10) : ''
ok(drow.startsWith('<dt'), 'faktisk-db-vinduet bliver')
ok(drow.includes('break-words min-w-0'), 'faktisk-db kan stadig krympe')
ok(!drow.includes('<th'), 'faktisk-db er ikke kolonnen')
ok(!drow.includes('\n'), 'faktisk-db-vinduet har ikke linjeskift')
ok(!drow.includes('\r'), 'faktisk-db-vinduet har ikke vognretur')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-case-column-wrap-test')
