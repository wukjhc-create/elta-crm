/**
 * Etiketten Sortering paa efterkalkulation kan krympe. Filteret bliver.
 *   npx tsx scripts/aftercalc-overview-sort-label-wrap-test.ts
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
const id = '>Sortering</span>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 59, at + 10) : ''
const bare = 'className="text-xs text-gray-500"'
ok(row.startsWith('<span'), 'det er etiketten Sortering')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('filters.sort'), 'filteret er et andet sted')
ok(!row.includes('SORTS.map'), 'valgene er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes("value={(filters.sort ?? 'worst_db') as AftercalcSort}"), 'sorteringsfilteret bliver')
ok(view.includes('{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}'), 'sorteringsvalgene bliver')
ok(view.includes('<dt className="text-gray-500">Tilbudt omsætning</dt>'), 'tilbudt-omsaetning bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
const afv = '>Afvigelse</span>'
const aat = view.indexOf(afv)
const arow = aat >= 0 ? view.slice(aat - 59, aat + 10) : ''
ok(arow.startsWith('<span'), 'afvigelse-etikettens vindue bliver')
ok(arow.includes('break-words min-w-0'), 'afvigelse-etiketten kan stadig krympe')
ok(!arow.includes('Sortering'), 'afvigelse-etiketten er ikke sortering')
ok(!arow.includes('\n'), 'afvigelse-etikettens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-sort-label-wrap-test')
