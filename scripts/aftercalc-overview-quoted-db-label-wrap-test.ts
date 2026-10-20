/**
 * Etiketten Tilbudt DB paa efterkalkulation kan krympe. Procenten bliver.
 *   npx tsx scripts/aftercalc-overview-quoted-db-label-wrap-test.ts
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
const id = '>Tilbudt DB</dt>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 49, at + 10) : ''
const bare = '<dt className="text-gray-500">'
ok(row.startsWith('<dt'), 'det er etiketten Tilbudt DB')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('quoted_db_pct'), 'procenten er et andet sted')
ok(!row.includes('<th'), 'kolonnen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words">{pct(r.quoted_db_pct)}</dd>'), 'procenten bliver')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Tilbudt DB %</th>'), 'skrivebordskolonnen kan krympe')
ok(view.includes('<dt className="text-gray-500 break-words min-w-0">Faktisk DB</dt>'), 'faktisk-db kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const faktisk = '>Faktisk omsætning</dt>'
const fat = view.indexOf(faktisk)
const frow = fat >= 0 ? view.slice(fat - 49, fat + 10) : ''
ok(frow.startsWith('<dt'), 'faktisk-omsaetningens vindue bliver')
ok(frow.includes('break-words min-w-0'), 'faktisk-omsaetning kan stadig krympe')
ok(!frow.includes('Tilbudt DB'), 'faktisk-omsaetning er ikke tilbudt db')
ok(!frow.includes('\n'), 'faktisk-omsaetningens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-quoted-db-label-wrap-test')
