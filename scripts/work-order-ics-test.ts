/**
 * Unit-tests for arbejdsordrer som kalenderfil (src/lib/utils/ics.ts generateWorkOrdersICS). Ingen DB.
 *   npx tsx scripts/work-order-ics-test.ts
 */
import { generateWorkOrdersICS, icsUtcStamp } from '../src/lib/utils/ics'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const now = new Date('2026-10-15T10:20:30.456Z')
ok(icsUtcStamp(now) === '20261015T102030Z', 'DTSTAMP i UTC', icsUtcStamp(now))
const ics = generateWorkOrdersICS([
  { id: 'a1', date: '2026-10-31', title: 'Tavle, ny; kunde', location: 'Vej 1, 8000 Aarhus', description: 'Sag S-1' },
  { id: 'b2', date: 'ugyldig', title: 'Springes over' },
], now)
const lines = ics.split('\r\n')
ok(lines[0] === 'BEGIN:VCALENDAR' && lines[lines.length - 1] === 'END:VCALENDAR', 'CRLF-adskilt kalender')
ok(lines.includes('UID:wo-a1@eltasolar.dk'), 'fast UID pr. arbejdsordre')
ok(lines.includes('DTSTART;VALUE=DATE:20261031') && lines.includes('DTEND;VALUE=DATE:20261101'), 'heldag; slut = næste dag over månedsskifte')
ok(lines.includes('SUMMARY:Tavle\\, ny\\; kunde') && lines.includes('LOCATION:Vej 1\\, 8000 Aarhus'), 'escaping af komma/semikolon')
ok(!ics.includes('Springes over') && lines.filter((l) => l === 'BEGIN:VEVENT').length === 1, 'ugyldig dato springes over')
ok(generateWorkOrdersICS([], now).split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length === 0, 'tom liste = gyldig tom kalender')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
