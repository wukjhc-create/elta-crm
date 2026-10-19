/**
 * Advarselsteksten paa efterkalkulationens mobilkort kan krympe. Beloeb og filtre bliver.
 *   npx tsx scripts/aftercalc-overview-warning-wrap-test.ts
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
const id = 'data-testid="aftercalc-mobile-warning"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 63, at + 10) : ''
const bare = 'className="mt-1 text-xs text-amber-900 break-words"'
const cell = 'className="mt-1 text-xs text-amber-900 break-words min-w-0" data-testid="aftercalc-mobile-warning"'
ok(row.startsWith('<p'), 'det er advarselsteksten')
ok(row.includes('break-words min-w-0'), 'advarselsteksten kan krympe')
ok(row.includes('mt-1 text-xs text-amber-900'), 'tekstklassen bliver')
ok(!row.includes('warning_codes'), 'koderne er et andet sted')
ok(!row.includes('DATA_QUALITY'), 'etiketterne er et andet sted')
ok(!row.includes('kr('), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'advarselsteksten findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes('r.warning_codes.length > 0'), 'betingelsen bliver')
ok(view.includes('DATA_QUALITY_LABELS[c]'), 'etiketterne bliver')
ok(view.includes('text-[11px] text-amber-900 break-words max-w-[12rem]'), 'skrivebordsadvarslen bliver')
ok(view.includes('data-testid="aftercalc-mobile-title"'), 'mobiltitlen bliver')
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
const title = 'data-testid="aftercalc-mobile-title"'
const tat = view.indexOf(title)
const trow = tat >= 0 ? view.slice(tat - 57, tat + 10) : ''
ok(trow.startsWith('<p'), 'titlens vindue bliver')
ok(trow.includes('break-words min-w-0'), 'titlen kan stadig krympe')
ok(!trow.includes(id), 'titlen er ikke advarselsteksten')
ok(!trow.includes('\n'), 'titlens vindue har ikke linjeskift')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-warning-wrap-test')
