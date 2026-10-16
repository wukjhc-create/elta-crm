/**
 * A-11 (review 2026-10-16): rykker-cooldown og forfaldsdage som danske kalenderdage.
 * Kør: npx tsx scripts/reminder-days-test.ts
 */
import { copenhagenCalendarDaysBetween as days } from '../src/lib/utils/copenhagen-time'

let fails = 0
function eq(name: string, got: number, want: number) {
  if (got === want) console.log(`PASS  ${name}`)
  else { fails++; console.log(`FAIL  ${name}: fik ${got}, forventede ${want}`) }
}

// Cooldown: rykker 07:00:40, kørsel 5 dage senere 07:00:10 (dansk sommertid, UTC+2) → 5 dage (før: 4)
eq('cooldown sekunder før samme klokkeslæt = 5 dage', days('2026-06-01T05:00:40Z', new Date('2026-06-06T05:00:10Z')), 5)
// Forfald: due 2026-06-10, kørsel 2026-06-13 kl. 00:30 dansk tid (= 2026-06-12T22:30Z) → 3 dage (før: 2)
eq('forfald efter dansk midnat (UTC dagen før)', days('2026-06-10', new Date('2026-06-12T22:30:00Z')), 3)
// Rykker sendt 23:30 dansk tid (= 21:30Z) tæller som den danske dato
eq('tidsstempel sent på aftenen = dansk dato', days('2026-06-01T21:30:00Z', new Date('2026-06-02T08:00:00Z')), 1)
// Rykker sendt 00:30 dansk tid (= 22:30Z dagen før i UTC) tæller som den nye danske dag
eq('tidsstempel lige efter dansk midnat', days('2026-06-01T22:30:00Z', new Date('2026-06-02T08:00:00Z')), 0)
// Over skift til vintertid (25. okt. 2026) — stadig hele kalenderdage
eq('over sommertid→vintertid', days('2026-10-23', new Date('2026-10-28T10:00:00Z')), 5)
// Over skift til sommertid (29. mar. 2026)
eq('over vintertid→sommertid', days('2026-03-27', new Date('2026-04-01T10:00:00Z')), 5)
// Samme dag
eq('samme dag = 0', days('2026-10-16', new Date('2026-10-16T12:00:00Z')), 0)
// Fremtidig dato → negativ
eq('fremtidig forfaldsdato = negativ', days('2026-10-20', new Date('2026-10-16T12:00:00Z')), -4)

if (fails > 0) { console.log(`\n❌ ${fails} fejl`); process.exit(1) }
console.log('\nALL PASS')
