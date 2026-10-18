/**
 * "Kun manglende kostdata" ombrydes. Afkrydsningen er uændret.
 *   npx tsx scripts/aftercalc-missing-cost-label-wrap-test.ts
 */
import { readFileSync } from 'node:fs'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const start = view.indexOf('data-testid="aftercalc-missing-cost-label"')
const row = start >= 0 ? view.slice(start - 280, start + 80) : ''
ok(row.includes('<span className="break-words min-w-0"'), 'teksten ombrydes')
ok(row.includes('Kun manglende kostdata'), 'teksten er uændret')
ok(row.includes('checked={filters.missingCostOnly === true}'), 'afkrydsningen læser det samme filter')
ok(row.includes('setFilter({ missingCostOnly: e.target.checked })'), 'afkrydsningen skriver det samme filter')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'teksten klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-missing-cost-label-wrap-test')
