/**
 * Datarækken i efterkalkulationens sagstabel kan krympe. Sagsnummerlinket og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-desktop-row-wrap-test.ts
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
const id = '<tr key={r.case_id} data-testid="aftercalc-overview-row" data-quality={r.data_quality} className="break-words min-w-0">'
const bare = '<tr key={r.case_id} data-testid="aftercalc-overview-row" data-quality={r.data_quality}>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<tr'), 'det er dataraekken')
ok(row.includes('break-words min-w-0'), 'dataraekken kan krympe')
ok(row.includes('data-testid="aftercalc-overview-row"'), 'raekke-testid bliver')
ok(row.includes('data-quality={r.data_quality}'), 'datakvaliteten bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('{r.case_number'), 'sagsnummeret er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'dataraekken findes en gang')
ok(view.split(bare).length === 1, 'den bare dataraekke er vaek')
ok(view.split('<tr className="break-words min-w-0">').length === 2, 'kolonneraekken bliver')
ok(view.includes('<Link href={`/dashboard/orders/${r.case_id}?tab=oekonomi`} className="text-blue-700 hover:underline break-words min-w-0">'), 'sagsnummerlinket kan stadig krympe')
ok(view.includes("{r.case_number || 'Sag'}"), 'sagsnummeret bliver')
ok(view.split('data-testid="aftercalc-mobile-case-link"').length === 2, 'mobilkortets link bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('<div className="mt-3 space-y-3">'), 'filterindholdet er stadig uden min-w-0')
ok(view.includes('<td className="px-2 py-1.5" title={r.warning_codes.map((c: DataQualityCode) => DATA_QUALITY_LABELS[c]).join(\', \')}>'), 'datakvalitetscellen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-desktop-row-wrap-test')
