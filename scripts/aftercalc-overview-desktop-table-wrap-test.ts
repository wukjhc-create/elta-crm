/**
 * Tabellen paa efterkalkulationens skrivebord kan krympe. Kolonner og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-desktop-table-wrap-test.ts
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
const id = '<table className="w-full text-sm break-words min-w-0">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<table'), 'det er skrivebordstabellen')
ok(row.includes('break-words min-w-0'), 'tabellen kan krympe')
ok(row.includes('w-full text-sm'), 'tabellens stoerrelse bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('thead'), 'tabelhovedet er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'tabellen findes en gang')
ok(view.split('<table className="w-full text-sm">').length === 1, 'den bare tabel er vaek')
ok(view.includes('<thead className="bg-gray-50 text-xs text-gray-600 break-words min-w-0">'), 'tabelhovedet kan krympe')
ok(view.includes('<th className="px-2 py-1.5 text-right break-words min-w-0">DB-afvigelse</th>'), 'afvigelseskolonnen kan stadig krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-desktop-table-wrap-test')
