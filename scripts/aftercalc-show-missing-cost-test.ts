/**
 * "Vis dem" slår det eksisterende filter til. Filterreglen ændres ikke.
 *   npx tsx scripts/aftercalc-show-missing-cost-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { offerMissingCostFilter } from '../src/lib/cases/aftercalc-overview'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(offerMissingCostFilter(3, false) === true, 'manglende kost kan vises')
ok(offerMissingCostFilter(3, null) === true, 'intet filter er ikke allerede slået til')
ok(offerMissingCostFilter(3, undefined) === true, 'udefineret filter er ikke slået til')
ok(offerMissingCostFilter(3, true) === false, 'filteret er allerede slået til')
ok(offerMissingCostFilter(0, false) === false, 'ingen manglende kost giver ingen knap')
ok(offerMissingCostFilter(-1, false) === false, 'negativt tal giver ingen knap')

const client = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
ok(client.includes('offerMissingCostFilter(data.quality.missingCost, filters.missingCostOnly)'), 'linjen bruger funktionen')
ok(client.includes('data-testid="aftercalc-show-missing-cost"'), 'knappen kan findes')
ok(client.includes('setFilter({ missingCostOnly: true })'), 'knappen slår det eksisterende filter til')
ok(client.includes('Vis dem'), 'teksten er Vis dem')

const overview = readFileSync(join('src', 'lib', 'cases', 'aftercalc-overview.ts'), 'utf8')
ok(overview.includes("if (query.missingCostOnly) list = list.filter((i) => i.row.warning_codes.some((c) => MISSING_COST.has(c)))"), 'filterreglen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-show-missing-cost-test')
