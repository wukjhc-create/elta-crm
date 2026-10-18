/**
 * Efterkalk-oversigten viser den faktureringsstatus rækken allerede har.
 *   npx tsx scripts/aftercalc-invoiced-state-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { invoicedStateLabel } from '../src/lib/cases/aftercalc-overview'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(invoicedStateLabel('not_invoiced') === 'Ikke faktureret', 'ikke faktureret')
ok(invoicedStateLabel('partially_invoiced') === 'Delvist faktureret', 'delvist')
ok(invoicedStateLabel('fully_invoiced') === 'Faktureret', 'faktureret')

const client = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
ok((client.match(/invoicedStateLabel\(r\.invoiced_state\)/g) ?? []).length === 2, 'mobil og tabel bruger teksten')
ok(client.includes('data-testid="aftercalc-invoiced-state"'), 'statussen kan findes')

const calc = readFileSync(join('src', 'lib', 'cases', 'aftercalc.ts'), 'utf8')
ok(calc.includes("invSum.issuedCount === 0 ? 'not_invoiced' : unbilled > 0 ? 'partially_invoiced' : 'fully_invoiced'"), 'statusberegningen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-invoiced-state-test')
