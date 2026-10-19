/**
 * Ansvarlig-linjen paa efterkalkulationens mobilkort kan krympe. Navn og filtre bliver.
 *   npx tsx scripts/aftercalc-overview-assignee-wrap-test.ts
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
const id = 'data-testid="aftercalc-mobile-assignee"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
const bare = 'className="text-xs text-gray-500 break-words"'
const cell = 'className="text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-mobile-assignee"'
ok(row.startsWith('<p'), 'det er ansvarlig-linjen')
ok(row.includes('break-words min-w-0'), 'ansvarlig-linjen kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('Ansvarlig'), 'navnet er et andet sted')
ok(!row.includes('assignee_name'), 'navneudtrykket er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'ansvarlig-linjen findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 2, 'titellinjen beholder den bare klasse')
ok(view.includes('break-words">{r.title}'), 'titlen bliver')
ok(view.includes('>Ansvarlig:'), 'ansvarlig-teksten bliver')
ok(view.includes("{r.assignee_name || '—'}"), 'navnet bliver')
ok(view.includes('break-words min-w-0" data-testid="aftercalc-mobile-customer">{r.customer_name'), 'kundenavnet kan krympe')
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
const link = 'data-testid="aftercalc-mobile-case-link"'
const lat = view.indexOf(link)
const linkRow = lat >= 0 ? view.slice(lat - 133, lat + 10) : ''
ok(linkRow.startsWith('<Link'), 'sagslinkets vindue bliver')
ok(linkRow.includes('break-words min-w-0'), 'sagslinket kan stadig krympe')
ok(!linkRow.includes(id), 'sagslinket er ikke ansvarlig-linjen')
ok(!linkRow.includes('\n'), 'sagslinkets vindue har ikke linjeskift')
ok(!linkRow.includes('Sag'), 'sagsnummeret er et andet sted')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-assignee-wrap-test')
