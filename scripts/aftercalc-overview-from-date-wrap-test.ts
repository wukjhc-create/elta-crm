/**
 * Etiketten Fra dato paa efterkalkulation kan krympe. Datoen og filtrene bliver.
 *   npx tsx scripts/aftercalc-overview-from-date-wrap-test.ts
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
const id = '>Fra dato</span>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 59, at + 10) : ''
const bare = 'className="text-xs text-gray-500"'
ok(row.startsWith('<span'), 'det er etiketten Fra dato')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('filters.from'), 'datoen er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 5, 'de andre etiketter beholder den bare klasse')
ok(view.includes('<span className="text-xs text-gray-500 break-words min-w-0">Til dato</span>'), 'til-dato kan krympe')
ok(view.includes('value={filters.from ?? \'\'}'), 'fra-filteret bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const variance = 'data-testid="aftercalc-variance-filter"'
const vat = view.indexOf(variance)
const vrow = vat >= 0 ? view.slice(vat - 57, vat + 10) : ''
ok(vrow.startsWith('<p'), 'afvigelsesfilterets vindue bliver')
ok(vrow.includes('break-words min-w-0'), 'afvigelsesfilteret kan stadig krympe')
ok(!vrow.includes('Fra dato'), 'filteret er ikke etiketten')
ok(!vrow.includes('\n'), 'filterets vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-from-date-wrap-test')
