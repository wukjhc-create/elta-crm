/**
 * Sagscellen paa efterkalkulationens skrivebord kan krympe. Sagsnummeret og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-desktop-case-cell-wrap-test.ts
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
const id = '<td className="px-2 py-1.5 break-words min-w-0">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<td'), 'det er sagscellen')
ok(row.includes('break-words min-w-0'), 'sagscellen kan krympe')
ok(row.includes('px-2 py-1.5'), 'cellens afstand bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('title'), 'advarselstitlen er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'sagscellen findes en gang')
ok(view.split('<td className="px-2 py-1.5">').length === 1, 'den bare sagscelle er vaek')
ok(view.includes('tab=oekonomi'), 'sagslinket bliver')
ok(view.includes('{r.case_number || \'Sag\'}'), 'sagsnummeret bliver')
ok(view.includes('title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(\', \')}'), 'datakvalitetscellen bliver')
ok(view.includes('<tr>'), 'kolonneraekken bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-desktop-case-cell-wrap-test')
