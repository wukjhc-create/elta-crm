/**
 * Kundenavnet i efterkalkulationens sagscelle kan krympe. Ansvarlig og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-desktop-customer-cell-wrap-test.ts
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
const id = '<td className="px-2 py-1.5 text-gray-800 break-words min-w-0">{r.customer_name || \'—\'}</td>'
const bare = '<td className="px-2 py-1.5 text-gray-800 break-words">{r.customer_name || \'—\'}</td>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<td'), 'det er kundenavnet')
ok(row.includes('break-words min-w-0'), 'kundenavnet kan krympe')
ok(row.includes('customer_name'), 'navnet bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('assignee_name'), 'ansvarlig er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kundenavnet findes en gang')
ok(view.split(bare).length === 1, 'det bare kundenavn er vaek')
ok(view.includes('<td className="px-2 py-1.5 text-gray-800 break-words">{r.assignee_name || \'—\'}</td>'), 'ansvarlig er stadig uden min-w-0')
ok(view.includes('<div className="text-[11px] text-gray-500 break-words min-w-0" data-testid="aftercalc-invoiced-state">'), 'faktureringstilstanden kan stadig krympe')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-desktop-customer-cell-wrap-test')
