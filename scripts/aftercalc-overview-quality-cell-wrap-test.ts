/**
 * Datakvalitetscellen paa efterkalkulation kan krympe. Maerket og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-quality-cell-wrap-test.ts
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
const id = '<td className="px-2 py-1.5 break-words min-w-0" title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(\', \')}>'
const bare = '<td className="px-2 py-1.5" title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(\', \')}>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<td'), 'det er datakvalitetscellen')
ok(row.includes('break-words min-w-0'), 'cellen kan krympe')
ok(row.includes('title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(\', \')}'), 'titlen bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('Advarsel'), 'maerket er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'cellen findes en gang')
ok(view.split(bare).length === 1, 'den bare celle er vaek')
ok(view.includes("{r.data_quality === 'warning' ? 'Advarsel' : 'OK'}"), 'maerket bliver')
ok(view.includes('<div className="mt-1 text-[11px] text-amber-900 break-words max-w-[12rem] min-w-0">'), 'advarselsteksten kan stadig krympe')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('<th className="px-2 py-1.5 text-left break-words min-w-0">Datakvalitet</th>'), 'kolonnen kan stadig krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-quality-cell-wrap-test')
