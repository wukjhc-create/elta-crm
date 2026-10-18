/**
 * Den tomme efterkalk-oversigt ombrydes. Begge sætninger er uændret.
 *   npx tsx scripts/aftercalc-empty-wrap-test.ts
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
ok(empty.includes('<p className="break-words min-w-0">'), 'den tomme tekst ombrydes')
ok(empty.includes('Ingen sager matcher filtrene.'), 'filtertom er uændret')
ok(empty.includes('Ingen sager i oversigten. Opret en sag fra kunden, så den kan efterkalkuleres her.'), 'tom oversigt er uændret')
ok(empty.includes('data-testid="aftercalc-clear-filters"'), 'nulstil bliver')
ok(empty.includes("setFilters({ sort: 'worst_db', page: 1, variance: 'all' })") || view.includes("setFilters({ sort: 'worst_db', page: 1, variance: 'all' })"), 'nulstil bruger de samme filtre')
ok(!empty.includes(' truncate') && !empty.includes('truncate '), 'teksten klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-empty-wrap-test')
