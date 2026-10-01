/** Unit: dansk lokaltid <-> UTC (sommertid). Kør: npx tsx scripts/copenhagen-time-test.ts */
import { copenhagenLocalToIso, copenhagenParts, calendarDaysSince } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`)
}
eq('sommer 08:00 -> 06:00Z', copenhagenLocalToIso('2026-10-01', '08:00'), '2026-10-01T06:00:00.000Z')
eq('vinter 08:00 -> 07:00Z (efter 25/10)', copenhagenLocalToIso('2026-10-26', '08:00'), '2026-10-26T07:00:00.000Z')
eq('dagen for vintertid 08:00', copenhagenLocalToIso('2026-10-25', '08:00'), '2026-10-25T07:00:00.000Z')
eq('dagen for sommertid 08:00', copenhagenLocalToIso('2026-03-29', '08:00'), '2026-03-29T06:00:00.000Z')
eq('januar 16:30', copenhagenLocalToIso('2027-01-15', '16:30'), '2027-01-15T15:30:00.000Z')
eq('ikke-eksisterende 02:30 (sommertid) -> efter skiftet', copenhagenLocalToIso('2026-03-29', '02:30'), '2026-03-29T01:30:00.000Z')
eq('midnat vinter', copenhagenLocalToIso('2026-12-01', '00:00'), '2026-11-30T23:00:00.000Z')
eq('parts sommer', copenhagenParts('2026-10-01T06:00:00.000Z'), { date: '2026-10-01', clock: '08:00' })
eq('parts vinter', copenhagenParts('2026-10-26T07:00:00.000Z'), { date: '2026-10-26', clock: '08:00' })
eq('parts dato-skift (23:30Z = næste dag lokalt)', copenhagenParts('2026-11-30T23:30:00.000Z'), { date: '2026-12-01', clock: '00:30' })
for (const [d, c] of [['2026-07-01', '07:15'], ['2026-11-11', '13:45'], ['2026-10-25', '03:00']] as const)
  eq(`round-trip ${d} ${c}`, copenhagenParts(copenhagenLocalToIso(d, c)), { date: d, clock: c })
eq('forfald: 14/10 er 1 dag over 15/10 kl. 00:30 dansk (22:30Z dagen før)', calendarDaysSince('2026-10-14', new Date('2026-10-14T22:30:00Z')), 1)
eq('forfald: samme dag kl. 23:59 dansk = 0', calendarDaysSince('2026-10-14', new Date('2026-10-14T21:59:00Z')), 0)
eq('forfald: vintertid 1/11 kl. 00:30 dansk (23:30Z) = 1', calendarDaysSince('2026-10-31', new Date('2026-10-31T23:30:00Z')), 1)
eq('forfald over sommertids-skifte (25/10): 20/10 → 30/10 = 10', calendarDaysSince('2026-10-20', new Date('2026-10-30T12:00:00Z')), 10)
eq('ISO-tidsstempel som fra-dato', calendarDaysSince('2026-10-10T00:00:00+00:00', new Date('2026-10-12T12:00:00Z')), 2)
eq('fremtidig dato = negativ', calendarDaysSince('2026-10-20', new Date('2026-10-14T12:00:00Z')), -6)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle copenhagen-time tests PASS')
process.exitCode = fail ? 1 : 0
