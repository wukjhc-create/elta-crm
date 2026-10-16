/**
 * O-12 (review 2026-10-16): portalens afvis bruger samme gyldigheds-/udløbsregel som accept.
 * Kør: npx tsx scripts/portal-response-guard-test.ts
 */
import { portalResponseBlockReason as why } from '../src/lib/offers/validity'

let fails = 0
function eq(name: string, got: unknown, want: unknown) {
  if (got === want) console.log(`PASS  ${name}`)
  else { fails++; console.log(`FAIL  ${name}: fik ${String(got)}, forventede ${String(want)}`) }
}
const now = new Date('2026-10-16T10:00:00Z')

eq('gyldig afvisning (sendt, ikke udløbet)', why('sent', '2026-10-31', false, 'reject', now), null)
eq('gyldig afvisning (set)', why('viewed', null, false, 'reject', now), null)
eq('sidste gyldige dag tæller med', why('sent', '2026-10-16', false, 'reject', now), null)
eq('udløbet → blokeret', why('sent', '2026-10-15', false, 'reject', now), 'Tilbuddet er udløbet — kontakt os for et nyt tilbud')
eq('accepteret → blokeret', why('accepted', '2026-10-31', false, 'reject', now), 'Tilbuddet er allerede accepteret')
eq('afvist → blokeret', why('rejected', '2026-10-31', false, 'reject', now), 'Tilbuddet er allerede afvist')
eq('kladde → blokeret', why('draft', '2026-10-31', false, 'reject', now), 'Tilbuddet kan ikke afvises i denne status')
eq('afløst revision → blokeret (når revisioner er aktive)', why('sent', '2026-10-31', true, 'reject', now), 'Tilbuddet er erstattet af en nyere version — genindlæs siden')
eq('accept bruger samme regel (udløbet)', why('viewed', '2026-10-01', false, 'accept', now), 'Tilbuddet er udløbet — kontakt os for et nyt tilbud')
eq('accept i forkert status', why('expired', null, false, 'accept', now), 'Tilbuddet kan ikke accepteres i denne status')
// dansk midnat: 2026-10-16 kl. 00:30 dansk tid = 2026-10-15T22:30Z → gyldig-til 2026-10-15 er udløbet
eq('udløb følger dansk dato', why('sent', '2026-10-15', false, 'reject', new Date('2026-10-15T22:30:00Z')), 'Tilbuddet er udløbet — kontakt os for et nyt tilbud')

if (fails > 0) { console.log(`\n❌ ${fails} fejl`); process.exit(1) }
console.log('\nALL PASS')
