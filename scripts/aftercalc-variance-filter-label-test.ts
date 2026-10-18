/**
 * Oversigten siger hvilket afvigelsesfilter der er aktivt. Filteret ændres ikke.
 *   npx tsx scripts/aftercalc-variance-filter-label-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { varianceFilterLabel } from '../src/lib/cases/aftercalc-overview'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(varianceFilterLabel('negative') === 'Negativ DB', 'negativ')
ok(varianceFilterLabel('positive') === 'Positiv DB', 'positiv')
ok(varianceFilterLabel('all') === 'Alle', 'alle')
ok(varianceFilterLabel(null) === 'Alle', 'null er alle')
ok(varianceFilterLabel(undefined) === 'Alle', 'udefineret er alle')

const client = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
ok(client.includes('varianceFilterLabel(filters.variance)'), 'oversigten kalder teksten')
ok(client.includes('data-testid="aftercalc-variance-filter"'), 'filteret kan findes')
ok(client.includes('Afvigelsesfilter:'), 'sætningen siger filteret')

const overview = readFileSync(join('src', 'lib', 'cases', 'aftercalc-overview.ts'), 'utf8')
ok(overview.includes("if (variance === 'negative') list = list.filter((i) => i.row.db_variance != null && i.row.db_variance < 0)"), 'negativ regel er uændret')
ok(overview.includes("if (variance === 'positive') list = list.filter((i) => i.row.db_variance != null && i.row.db_variance > 0)"), 'positiv regel er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-variance-filter-label-test')
