/**
 * Unit-tests for valg af ekstern modtager (pickFirstExternalEmail i src/lib/services/mail-routing.ts). Ingen DB.
 *   npx tsx scripts/mail-recipient-test.ts
 */
import { pickFirstExternalEmail, isFormRelayEmail } from '../src/lib/services/mail-routing'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${got} forventet=${want}`}`) }

eq('webhenvendelse uden Reply-To → springer FormSubmit over til kundens mail', pickFirstExternalEmail([null, 'submissions@formsubmit.co', 'kontakt@eltasolar.dk', 'kunde@firma.dk']), 'kunde@firma.dk')
eq('webhenvendelse uden kunde-mail → ingen modtager (ikke FormSubmit)', pickFirstExternalEmail([null, 'submissions@formsubmit.co', 'kontakt@eltasolar.dk', null]), null)
eq('Reply-To fra formularen vinder', pickFirstExternalEmail(['kunde@gmail.com', 'submissions@formsubmit.co']), 'kunde@gmail.com')
eq('almindelig kundemail uændret', pickFirstExternalEmail([null, 'Kunde@Firma.dk']), 'kunde@firma.dk')
eq('intern afsender springes over', pickFirstExternalEmail(['ordre@eltasolar.dk', 'kunde@firma.dk']), 'kunde@firma.dk')
eq('FormSubmit-subdomæne genkendes', isFormRelayEmail('noreply@mail.formsubmit.co'), true)
eq('ligner-domæne er ikke relæ', isFormRelayEmail('info@notformsubmit.com'), false)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle modtager-tests bestået')
process.exitCode = bad ? 1 : 0
