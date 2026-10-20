/**
 * Kolonnen Datakvalitet paa efterkalkulationens skrivebord kan krympe. Maerket bliver.
 *   npx tsx scripts/aftercalc-overview-quality-column-wrap-test.ts
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
const id = '>Datakvalitet</th>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
ok(row.startsWith('<th'), 'det er kolonnen Datakvalitet')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('text-left'), 'venstrestillingen bliver')
ok(row.endsWith('>Datakvali'), 'etiketten bliver')
ok(!row.includes('Status'), 'statuskolonnen er et andet sted')
ok(!row.includes('Advarsel'), 'maerket er et andet sted')
ok(!row.includes('data_quality'), 'vaerdien er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split('<th className="px-2 py-1.5 text-left">Datakvalitet</th>').length === 1, 'den bare kolonne er vaek')
ok(view.includes("<td className=\"px-2 py-1.5 break-words min-w-0\" title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(', ')}>"), 'cellen kan krympe')
ok(view.includes("{r.data_quality === 'warning' ? 'Advarsel' : 'OK'}"), 'maerket bliver')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">Tilbudt omsætning</th>'), 'tilbudt-omsaetning-kolonnen kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const status = '>Status</th>'
const sat = view.indexOf(status)
const srow = sat >= 0 ? view.slice(sat - 57, sat + 10) : ''
ok(srow.startsWith('<th'), 'status-vinduet bliver')
ok(srow.includes('break-words min-w-0'), 'status kan stadig krympe')
ok(srow.endsWith('>Status</t'), 'status-etiketten bliver')
ok(!srow.includes('Datakvalitet'), 'status-vinduet er ikke datakvalitet')
ok(!srow.includes('\n'), 'status-vinduet har ikke linjeskift')
ok(!srow.includes('\r'), 'status-vinduet har ikke vognretur')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-quality-column-wrap-test')
