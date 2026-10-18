/**
 * "Nulstil filtre" i den tomme efterkalk-oversigt ombrydes. Teksten er uændret.
 *   npx tsx scripts/aftercalc-clear-filters-wrap-test.ts
 */
import { readFileSync } from 'node:fs'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const start = view.indexOf('data-testid="aftercalc-empty"')
const end = view.indexOf('data-testid="aftercalc-overview-mobile"')
const empty = start >= 0 && end > start ? view.slice(start, end) : ''
const btn = view.indexOf('data-testid="aftercalc-clear-filters"')
const row = btn >= 0 ? view.slice(btn - 180, btn + 90) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('Nulstil filtre'), 'knapteksten er uændret')
ok(row.includes('onClick={resetFilters}'), 'nulstil kalder den samme funktion')
ok(empty.includes('Ingen sager matcher filtrene.'), 'filtertom er uændret')
ok(empty.includes('Ingen sager i oversigten. Opret en sag fra kunden, så den kan efterkalkuleres her.'), 'tom oversigt er uændret')
ok(empty.includes('<p className="break-words min-w-0">'), 'den tomme tekst ombrydes stadig')
ok(view.includes("setFilters({ sort: 'worst_db', page: 1, variance: 'all' })"), 'filtrene er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'knappen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-clear-filters-wrap-test')
