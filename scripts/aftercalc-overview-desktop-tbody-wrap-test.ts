/**
 * Tabelkroppen paa efterkalkulationens skrivebord kan krympe. Raekker og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-desktop-tbody-wrap-test.ts
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
const id = '<tbody className="divide-y divide-gray-100 break-words min-w-0">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<tbody'), 'det er tabelkroppen')
ok(row.includes('break-words min-w-0'), 'tabelkroppen kan krympe')
ok(row.includes('divide-y divide-gray-100'), 'skillelinjerne bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('<tr'), 'raekken er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'tabelkroppen findes en gang')
ok(view.split('<tbody className="divide-y divide-gray-100">').length === 1, 'den bare tabelkrop er vaek')
ok(view.includes('<div className="hidden md:block overflow-x-auto break-words min-w-0">'), 'tabelrullen kan stadig krympe')
ok(view.includes('<td className="px-2 py-1.5 break-words min-w-0">'), 'sagscellen kan krympe')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-desktop-tbody-wrap-test')
