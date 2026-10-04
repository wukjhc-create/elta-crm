/**
 * N78: email-parser — postnr. og by fra separate linjer (webformularer: "Postnummer: 4000" + "By: Roskilde").
 *   npx tsx scripts/email-parser-city-test.ts
 */
import { parseCustomerFromEmail } from '../src/lib/utils/email-parser'

let failed = 0
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '❌'} ${name}${ok ? '' : ` — fik ${JSON.stringify(got)}, ville have ${JSON.stringify(want)}`}`)
}
const p = (lines: string[]) => parseCustomerFromEmail(lines.join('\n'), null, null)

const a = p(['Navn: Hans Hansen', 'Adresse: Solvej 12', 'Postnummer: 4000', 'By: Roskilde'])
eq('postnr. + by på hver sin linje', [a.postalCode, a.city], ['4000', 'Roskilde'])
const b = p(['Navn: Hans Hansen', 'Adresse: Solvej 12', 'By: Roskilde', 'Postnummer: 4000'])
eq('by før postnr.', [b.postalCode, b.city], ['4000', 'Roskilde'])
const c = p(['Navn: Hans Hansen', 'Adresse: Solvej 12', 'Postnr/by: 4000 Roskilde'])
eq('samlet "postnr/by"', [c.postalCode, c.city], ['4000', 'Roskilde'])
const d = p(['Navn: Hans Hansen', 'Postnr/by: 4000 Roskilde', 'By: Køge'])
eq('første fund vinder (by overskrives ikke)', [d.postalCode, d.city], ['4000', 'Roskilde'])

if (failed) { console.log(`❌ ${failed} fejlede`); process.exit(1) }
console.log('✅ alle parser-by-tests bestået')
