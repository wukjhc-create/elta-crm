/**
 * Afvigelsesfilteret paa efterkalkulation kan krympe. Tekst og filtre bliver.
 *   npx tsx scripts/aftercalc-overview-variance-filter-wrap-test.ts
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
const id = 'data-testid="aftercalc-variance-filter"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
const bare = 'className="text-xs text-gray-600 break-words"'
ok(row.startsWith('<p'), 'det er afvigelsesfilteret')
ok(row.includes('break-words min-w-0'), 'afvigelsesfilteret kan krympe')
ok(row.includes('text-xs text-gray-600'), 'tekstklassen bliver')
ok(!row.includes('varianceFilterLabel'), 'teksten er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'filteret findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes('varianceFilterLabel(filters.variance)'), 'filterteksten bliver')
ok(view.includes('Afvigelsesfilter:'), 'saetningen bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const invoiced = 'data-testid="aftercalc-invoiced-state"'
const iat = view.indexOf(invoiced)
const irow = iat >= 0 ? view.slice(iat - 57, iat + 10) : ''
ok(irow.startsWith('<p'), 'faktureringstilstandens vindue bliver')
ok(irow.includes('break-words min-w-0'), 'faktureringstilstanden kan stadig krympe')
ok(!irow.includes(id), 'faktureringstilstanden er ikke filteret')
ok(!irow.includes('\n'), 'faktureringstilstandens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-variance-filter-wrap-test')
