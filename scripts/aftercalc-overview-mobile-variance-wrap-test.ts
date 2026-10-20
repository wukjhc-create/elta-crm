/**
 * DB-afvigelsen paa efterkalkulationens mobilkort kan krympe. Beloebene bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-variance-wrap-test.ts
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
const id = '<p className={`mt-2 text-sm tabular-nums break-words min-w-0 ${r.db_variance == null ? \'text-gray-400\' : r.db_variance < 0 ? \'text-red-700\' : r.db_variance > 0 ? \'text-emerald-700\' : \'text-gray-700\'}`}>'
const bare = '<p className={`mt-2 text-sm tabular-nums break-words ${r.db_variance == null ? \'text-gray-400\' : r.db_variance < 0 ? \'text-red-700\' : r.db_variance > 0 ? \'text-emerald-700\' : \'text-gray-700\'}`}>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<p'), 'det er afvigelsen')
ok(row.includes('break-words min-w-0'), 'afvigelsen kan krympe')
ok(row.includes('variance') === false ? false : row.includes('r.db_variance'), 'betingelsen bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('quoted_revenue'), 'tilbudt omsaetning er et andet sted')
ok(!row.includes('actual_db_pct'), 'faktisk db er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'afvigelsen findes en gang')
ok(view.split(bare).length === 1, 'den bare afvigelse er vaek')
ok(view.includes('DB-afvigelse: {varianceText(r.db_variance, r.db_variance_pct_points)}'), 'teksten bliver')
ok(view.includes('<td className={`px-2 py-1.5 text-right tabular-nums break-words min-w-0 ${r.db_variance == null ? \'text-gray-400\' : r.db_variance < 0 ? \'text-red-700\' : r.db_variance > 0 ? \'text-emerald-700\' : \'text-gray-700\'}`}>'), 'skrivebordsafvigelsen bliver')
ok(view.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{pct(r.actual_db_pct)}</dd>'), 'faktisk db kan krympe')
ok(view.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige'), 'Forrige bliver 44 px')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-variance-wrap-test')
