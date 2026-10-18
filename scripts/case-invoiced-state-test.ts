/**
 * Sagspanelet bruger den samme faktureringsstatus som oversigten.
 *   npx tsx scripts/case-invoiced-state-test.ts
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

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
ok(panel.includes('invoicedStateLabel(data.invoiced_state)'), 'panelet kalder den fælles tekst')
ok(panel.includes('data-testid="case-invoiced-state"'), 'statussen kan findes')
ok(!panel.includes('const INVOICED'), 'det lokale kort er væk')

const calc = readFileSync(join('src', 'lib', 'cases', 'aftercalc.ts'), 'utf8')
ok(calc.includes("invSum.issuedCount === 0 ? 'not_invoiced' : unbilled > 0 ? 'partially_invoiced' : 'fully_invoiced'"), 'statusberegningen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-invoiced-state-test')
