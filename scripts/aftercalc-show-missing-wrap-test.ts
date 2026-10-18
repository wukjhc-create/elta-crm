/**
 * "Vis dem" ombrydes. Filterreglen og teksten er uændret.
 *   npx tsx scripts/aftercalc-show-missing-wrap-test.ts
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
ok(offerMissingCostFilter(3, true) === false, 'filteret er allerede slået til')
ok(offerMissingCostFilter(0, false) === false, 'ingen manglende kost giver ingen knap')

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const btn = view.indexOf('data-testid="aftercalc-show-missing-cost"')
const row = btn >= 0 ? view.slice(btn - 140, btn + 160) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('>Vis dem<') || row.includes('Vis dem'), 'teksten er Vis dem')
ok(row.includes('setFilter({ missingCostOnly: true })'), 'knappen slår det eksisterende filter til')
ok(view.includes('offerMissingCostFilter(data.quality.missingCost, filters.missingCostOnly)'), 'linjen bruger funktionen')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'knappen klippes ikke')

const overview = readFileSync(join('src', 'lib', 'cases', 'aftercalc-overview.ts'), 'utf8')
ok(overview.includes("if (query.missingCostOnly) list = list.filter((i) => i.row.warning_codes.some((c) => MISSING_COST.has(c)))"), 'filterreglen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-show-missing-wrap-test')
