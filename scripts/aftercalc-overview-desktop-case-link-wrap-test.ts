/**
 * Sagsnummerlinket i efterkalkulationens sagscelle kan krympe. Mobilkortet og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-desktop-case-link-wrap-test.ts
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
const id = '<Link href={`/dashboard/orders/${r.case_id}?tab=oekonomi`} className="text-blue-700 hover:underline break-words min-w-0">'
const bare = '<Link href={`/dashboard/orders/${r.case_id}?tab=oekonomi`} className="text-blue-700 hover:underline break-words">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<Link'), 'det er sagsnummerlinket')
ok(row.includes('break-words min-w-0'), 'linket kan krympe')
ok(row.includes('hover:underline'), 'understregningen bliver')
ok(row.includes('tab=oekonomi'), 'oekonomilinket bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('{r.case_number'), 'sagsnummeret er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'linket findes en gang')
ok(view.split(bare).length === 1, 'det bare link er vaek')
ok(view.includes("{r.case_number || 'Sag'}"), 'sagsnummeret bliver')
ok(view.split('data-testid="aftercalc-mobile-case-link"').length === 2, 'mobilkortets link bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('<td className="px-2 py-1.5 text-gray-800 break-words min-w-0">{r.assignee_name || \'—\'}</td>'), 'ansvarlig kan stadig krympe')
ok(view.includes('<tr key={r.case_id} data-testid="aftercalc-overview-row" data-quality={r.data_quality} className="break-words min-w-0">'), 'dataraekken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-desktop-case-link-wrap-test')
