/**
 * Kundenavnet paa efterkalkulationens mobilkort kan krympe. Beloeb og filtre bliver.
 *   npx tsx scripts/aftercalc-overview-customer-wrap-test.ts
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
const id = 'data-testid="aftercalc-mobile-customer"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
const bare = 'className="text-sm text-gray-800 break-words"'
const cell = 'className="text-sm text-gray-800 break-words min-w-0" data-testid="aftercalc-mobile-customer"'
ok(row.startsWith('<p'), 'det er kundenavnet')
ok(row.includes('break-words min-w-0'), 'kundenavnet kan krympe')
ok(row.includes('text-sm text-gray-800'), 'tekstklassen bliver')
ok(!row.includes('customer_name'), 'navnet er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'kundenavnet findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes("{r.customer_name || '—'}"), 'navnet bliver')
ok(view.includes('break-words">{r.title}'), 'titlen bliver')
ok(view.split('className="text-xs text-gray-500 break-words"').length === 2, 'titellinjen beholder den bare klasse')
ok(view.includes('>Ansvarlig:'), 'ansvarlig-teksten bliver')
ok(view.split('tabular-nums text-gray-900 break-words').length - 1 === 4, 'mobilens fire beloeb bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt omsaetning bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const assignee = 'data-testid="aftercalc-mobile-assignee"'
const aat = view.indexOf(assignee)
const arow = aat >= 0 ? view.slice(aat - 57, aat + 10) : ''
ok(arow.startsWith('<p'), 'ansvarlig-vinduet bliver')
ok(arow.includes('break-words min-w-0'), 'ansvarlig-linjen kan stadig krympe')
ok(!arow.includes(id), 'ansvarlig-linjen er ikke kundenavnet')
ok(!arow.includes('\n'), 'ansvarlig-vinduet har ikke linjeskift')
ok(!arow.includes('Ansvarlig'), 'ansvarlig-teksten er et andet sted')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-customer-wrap-test')
