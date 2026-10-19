/**
 * Den tomme efterkalkulation kan krympe. Teksten og filtrene bliver.
 *   npx tsx scripts/aftercalc-overview-empty-wrap-test.ts
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
const id = 'data-testid="aftercalc-empty"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 59, at + 10) : ''
const bare = '<div className="text-sm text-gray-500" data-testid="aftercalc-empty">'
const cell = '<div className="text-sm text-gray-500 break-words min-w-0" data-testid="aftercalc-empty">'
ok(row.startsWith('<div'), 'det er den tomme tilstand')
ok(row.includes('break-words min-w-0'), 'den tomme tilstand kan krympe')
ok(row.includes('text-sm text-gray-500'), 'tekststoerrelsen bliver')
ok(!row.includes('Ingen'), 'saetningen er et andet sted')
ok(!row.includes('Nulstil'), 'knappen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'den tomme tilstand findes en gang')
ok(view.split(cell).length === 2, 'klassen findes en gang')
ok(view.split(bare).length === 1, 'den bare div er vaek')
ok(view.includes('Ingen sager matcher filtrene.'), 'filtertom er uændret')
ok(view.includes('Ingen sager i oversigten. Opret en sag fra kunden, så den kan efterkalkuleres her.'), 'tom oversigt er uændret')
ok(view.includes('<p className="break-words min-w-0">{filtersActive ?'), 'den indre tekst bliver')
ok(view.includes('data-testid="aftercalc-clear-filters"'), 'nulstil bliver')
ok(view.includes("setFilters({ sort: 'worst_db', page: 1, variance: 'all' })"), 'filtrene bliver')
ok(view.includes('>Fra dato</span>'), 'fra-dato bliver')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('Tilbudt mod faktisk dækningsbidrag pr. sag. Beløb er ekskl. moms.'), 'beloebsteksten bliver')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
const spin = 'data-testid="aftercalc-overview-loading-spinner"'
const sat = view.indexOf(spin)
const spinRow = sat >= 0 ? view.slice(sat - 62, sat + 10) : ''
ok(spinRow.startsWith('<Loader2'), 'spinner-vinduet bliver')
ok(!spinRow.includes(id), 'spinneren er ikke den tomme tilstand')
ok(!spinRow.includes('\n'), 'spinner-vinduet har ikke linjeskift')
const para = 'data-testid="aftercalc-overview-loading"'
const start = view.indexOf(para)
const look = start >= 0 ? view.slice(start - 80, start + 200) : ''
ok(look.includes('> Henter…</p>'), 'ventevinduet naar teksten')
ok(look.includes(spin), 'ventevinduet naar spinneren')
ok(!look.slice(0, 80).includes('Loader2'), 'tilbageblikket er ikke spinneren')
ok(!look.includes(id), 'ventevinduet er ikke den tomme tilstand')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-empty-wrap-test')
