/**
 * Sagspanelets indledning ombrydes. Faktureringsstatus og beløbstekst er uændret.
 *   npx tsx scripts/case-aftercalc-intro-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="case-aftercalc-intro"')
const end = panel.indexOf('data-testid="aftercalc-summary-mobile"', start)
const intro = start >= 0 && end > start ? panel.slice(start - 80, end) : ''
ok(intro.includes('data-testid="case-aftercalc-intro"'), 'indledningen kan findes')
ok(intro.includes('break-words min-w-0'), 'indledningen ombrydes')
ok(intro.includes('Tilbud ${data.offer.offer_number ?? \'\'} mod sagens registrerede forbrug og udstedte fakturaer. Beløb er ekskl. moms.'), 'tilbudsteksten er uændret')
ok(intro.includes('Sagen har intet tilbud. Faktisk forbrug og fakturering vises alligevel.'), 'uden-tilbud-teksten er uændret')
ok(intro.includes('data-testid="case-invoiced-state">{invoicedStateLabel(data.invoiced_state)}'), 'faktureringsstatus er uændret')
ok(intro.includes("data.data_quality === 'warning' ? ' DB vises kun, hvor kostgrundlaget er komplet.' : ''"), 'kostadvarslen er uændret')
ok(!intro.includes('truncate'), 'indledningen klippes ikke')
ok(panel.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), 'kr() er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-aftercalc-intro-wrap-test')
