/**
 * Sagslinket paa efterkalkulationens mobilkort kan krympe. Beloeb og filtre bliver.
 *   npx tsx scripts/aftercalc-overview-case-link-wrap-test.ts
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
const id = 'data-testid="aftercalc-mobile-case-link"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 133, at + 10) : ''
const bare = 'className="font-medium text-blue-700 hover:underline break-words"'
const cell = 'className="font-medium text-blue-700 hover:underline break-words min-w-0" data-testid="aftercalc-mobile-case-link"'
const desktop = 'className="text-blue-700 hover:underline break-words"'
ok(row.startsWith('<Link'), 'det er sagslinket')
ok(row.includes('break-words min-w-0'), 'sagslinket kan krympe')
ok(row.includes('font-medium text-blue-700 hover:underline'), 'linkklassen bliver')
ok(row.includes('tab=oekonomi'), 'oekonomilinket bliver')
ok(!row.includes('Sag'), 'sagsnummeret er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'sagslinket findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split(desktop).length === 2, 'skrivebordslinket bliver')
ok(view.includes("{r.case_number || 'Sag'}"), 'sagsnummeret bliver')
ok(view.includes('>Ansvarlig:'), 'ansvarlig-linjen bliver')
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
const head = 'data-testid="aftercalc-card-head"'
const hat = view.indexOf(head)
const headRow = hat >= 0 ? view.slice(hat - 76, hat + 10) : ''
ok(headRow.startsWith('<div'), 'hovedets vindue bliver')
ok(headRow.includes('break-words min-w-0'), 'hovedet kan stadig krympe')
ok(!headRow.includes(id), 'hovedet er ikke sagslinket')
ok(!headRow.includes('\n'), 'hovedets vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-case-link-wrap-test')
