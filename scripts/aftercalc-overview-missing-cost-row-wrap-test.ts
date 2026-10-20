/**
 * Etiketten omkring manglende kost kan krympe. Teksten og filteret bliver.
 *   npx tsx scripts/aftercalc-overview-missing-cost-row-wrap-test.ts
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
const id = '<label className="flex items-center gap-2 text-sm text-gray-700 break-words min-w-0">'
const bare = '<label className="flex items-center gap-2 text-sm text-gray-700 min-w-0">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<label'), 'det er etiketten')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('flex items-center gap-2'), 'raekken bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('Kun manglende kostdata'), 'teksten er et andet sted')
ok(!row.includes('missingCostOnly'), 'filteret er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 1, 'den bare etiket er vaek')
ok(view.includes('checked={filters.missingCostOnly === true}'), 'afkrydsningen laeser det samme filter')
ok(view.includes('setFilter({ missingCostOnly: e.target.checked })'), 'afkrydsningen skriver det samme filter')
ok(view.includes('<span className="break-words min-w-0" data-testid="aftercalc-missing-cost-label">Kun manglende kostdata</span>'), 'teksten kan stadig krympe')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-missing-cost-row-wrap-test')
