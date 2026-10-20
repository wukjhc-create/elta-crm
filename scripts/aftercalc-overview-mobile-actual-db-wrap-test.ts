/**
 * Faktisk DB paa efterkalkulationens mobilkort kan krympe. De andre beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-actual-db-wrap-test.ts
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
const id = '<dd className="tabular-nums text-gray-900 break-words min-w-0">{pct(r.actual_db_pct)}</dd>'
const bare = '<dd className="tabular-nums text-gray-900 break-words">{pct(r.actual_db_pct)}</dd>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<dd'), 'det er faktisk db')
ok(row.includes('break-words min-w-0'), 'procenten kan krympe')
ok(row.includes('{pct(r.actual_db_pct)}'), 'kaldet bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('quoted_revenue'), 'tilbudt omsaetning er et andet sted')
ok(!row.includes('actual_revenue'), 'faktisk omsaetning er et andet sted')
ok(!row.includes('quoted_db_pct'), 'tilbudt db er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'procenten findes en gang')
ok(view.split(bare).length === 1, 'den bare procent er vaek')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{kr(r.quoted_revenue)}</dd>'), 'tilbudt omsaetning kan krympe')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{kr(r.actual_revenue)}</dd>'), 'faktisk omsaetning kan krympe')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{pct(r.quoted_db_pct)}</dd>'), 'tilbudt db kan krympe')
ok(view.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beloeb bliver')
ok(view.includes('<td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{pct(r.actual_db_pct)}</td>'), 'skrivebordsprocenten bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('<dt className="text-gray-500 break-words min-w-0">Faktisk DB</dt>'), 'etiketten kan stadig krympe')
ok(view.includes('mt-2 text-sm tabular-nums break-words min-w-0 ${'), 'afvigelsen kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-actual-db-wrap-test')
