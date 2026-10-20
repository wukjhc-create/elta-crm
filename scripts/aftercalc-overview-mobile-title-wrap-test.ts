/**
 * Titlen paa efterkalkulationens mobilkort kan krympe. Beloeb og filtre bliver.
 *   npx tsx scripts/aftercalc-overview-mobile-title-wrap-test.ts
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
const id = 'data-testid="aftercalc-mobile-title"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 57, at + 10) : ''
const bare = 'className="text-xs text-gray-500 break-words"'
const cell = 'className="text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-mobile-title"'
ok(row.startsWith('<p'), 'det er titlen')
ok(row.includes('break-words min-w-0'), 'titlen kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('{r.title}'), 'titlen er et andet sted')
ok(!row.includes('&&'), 'betingelsen er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'titlen findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes('{r.title &&'), 'betingelsen bliver')
ok(view.includes('{r.title}</p>'), 'titelteksten bliver')
ok(view.includes('text-[11px] text-gray-500 break-words max-w-[16rem] min-w-0">{r.title}'), 'skrivebordstitlen kan krympe')
ok(view.includes('>Ansvarlig:'), 'ansvarlig-teksten bliver')
ok(view.includes('data-testid="aftercalc-mobile-customer"'), 'kundenavnet bliver')
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
const customer = 'data-testid="aftercalc-mobile-customer"'
const cat = view.indexOf(customer)
const crow = cat >= 0 ? view.slice(cat - 57, cat + 10) : ''
ok(crow.startsWith('<p'), 'kundens vindue bliver')
ok(crow.includes('break-words min-w-0'), 'kundenavnet kan stadig krympe')
ok(!crow.includes(id), 'kundenavnet er ikke titlen')
ok(!crow.includes('\n'), 'kundens vindue har ikke linjeskift')
const heading = 'data-testid="aftercalc-overview-title"'
const hat = view.indexOf(heading)
const hrow = hat >= 0 ? view.slice(hat - 69, hat + 10) : ''
ok(hrow.startsWith('<h1'), 'overskriftens vindue bliver')
ok(hrow.includes('break-words min-w-0'), 'overskriften kan stadig krympe')
ok(!hrow.includes(id), 'overskriften er ikke mobiltitlen')
ok(!hrow.includes('\n'), 'overskriftens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-mobile-title-wrap-test')
