/**
 * T-5 (review 2026-10-16): normalisering af kunde-mail + pladsholdere (tæller aldrig som dublet).
 * Kør: npx tsx scripts/customer-email-test.ts
 */
import { normalizeCustomerEmail as norm, isPlaceholderEmail as ph, duplicateEmailMessage } from '../src/lib/customers/customer-email'

let fails = 0
function eq(name: string, got: unknown, want: unknown) {
  if (got === want) console.log(`PASS  ${name}`)
  else { fails++; console.log(`FAIL  ${name}: fik ${String(got)}, forventede ${String(want)}`) }
}

eq('trim + små bogstaver', norm('  Jens@Firma.DK '), 'jens@firma.dk')
eq('null → tom', norm(null), '')
eq('tom streng er pladsholder', ph(''), true)
eq('kun mellemrum er pladsholder', ph('   '), true)
eq('uden @ er pladsholder', ph('ingen mail'), true)
eq('auto-pladsholder', ph('auto+C000123@elta-crm.local'), true)
eq('auto-pladsholder med store bogstaver', ph('AUTO+C1@ELTA-CRM.LOCAL'), true)
eq('rigtig mail er ikke pladsholder', ph('jens@firma.dk'), false)
eq('besked nævner kundenr. og navn', /C000123 – Firma A\/S/.test(duplicateEmailMessage(' Jens@Firma.dk', { id: 'x', company_name: 'Firma A/S', customer_number: 'C000123', is_active: true })), true)
eq('besked med normaliseret mail', duplicateEmailMessage(' Jens@Firma.dk', { id: 'x', company_name: null, customer_number: null, is_active: true }).includes('jens@firma.dk'), true)

if (fails > 0) { console.log(`\n❌ ${fails} fejl`); process.exit(1) }
console.log('\nALL PASS')
