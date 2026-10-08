/**
 * Mail-review 2026-10-08 (#10): besigtigelses-ICS — sluttid ruller korrekt over midnat/år (før T240000/T250000).
 *   npx tsx scripts/ics-end-test.ts
 */
import { generateBesigtigelseICS } from '../src/lib/utils/ics'

let fails = 0
const cases: Array<[string, string, string, string]> = [
  ['2026-10-08', '08:00', '20261008T080000', '20261008T100000'],
  ['2026-10-31', '23:00', '20261031T230000', '20261101T010000'],
  ['2026-12-31', '22:30', '20261231T223000', '20270101T003000'],
]
for (const [d, t, start, end] of cases) {
  const lines = generateBesigtigelseICS({ title: 'x', startDate: d, startTime: t }).split(/\r?\n/)
  const ok = lines.includes(`DTSTART;TZID=Europe/Copenhagen:${start}`) && lines.includes(`DTEND;TZID=Europe/Copenhagen:${end}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${d} ${t} → slut ${end}`)
  if (!ok) fails++
}
console.log(fails ? `\n❌ ${fails} FEJL` : '\n✅ ICS-sluttid ok')
process.exit(fails ? 1 : 0)
