/**
 * N80: unit-tests for src/lib/email/undeliverable.ts.
 *   npx tsx scripts/undeliverable-test.ts
 */
import { undeliverableRecipients } from '../src/lib/email/undeliverable'

let failed = 0
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '❌'} ${name}${ok ? '' : ` — fik ${JSON.stringify(got)}, ville have ${JSON.stringify(want)}`}`)
}
eq('pladsholder afvises', undeliverableRecipients('auto+k-1001@elta-crm.local'), ['auto+k-1001@elta-crm.local'])
eq('almindelig adresse ok', undeliverableRecipients('hans@firma.dk'), [])
eq('"Navn <adr>" ok', undeliverableRecipients('Hans <hans@firma.dk>'), [])
eq('liste med én pladsholder', undeliverableRecipients(['a@firma.dk', 'Auto <auto+x@ELTA-CRM.LOCAL>']), ['Auto <auto+x@ELTA-CRM.LOCAL>'])
eq('kommasepareret', undeliverableRecipients('a@firma.dk, b@x.invalid'), ['b@x.invalid'])
eq('harness-adresser (.test) blokeres ikke', undeliverableRecipients('kunde@harness.test'), [])
eq('tom modtager', undeliverableRecipients(''), [])
if (failed) { console.log(`❌ ${failed} fejlede`); process.exit(1) }
console.log('✅ alle modtager-tests bestået')
