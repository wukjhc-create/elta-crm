/**
 * Unit-tests for arbejdsordrer som kalenderfil (src/lib/utils/ics.ts generateWorkOrdersICS). Ingen DB.
 *   npx tsx scripts/work-order-ics-test.ts
 */
import { foldICSLine, generateFollowUpICS, generateWorkOrdersICS, icsUtcStamp } from '../src/lib/utils/ics'

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
ok(!ics.includes('BEGIN:VTIMEZONE'), 'kun heldag → ingen tidszone-blok')

// 00227: tidsbestemt begivenhed med varighed (lokal tid + tidszone), uden varighed ingen gættet sluttid
const timed = generateWorkOrdersICS([
  { id: 't1', date: '2026-10-31', title: 'Tavle', startTime: '22:30:00', estimatedHours: 3 },
  { id: 't2', date: '2026-10-20', title: 'Besøg', startTime: '08:00', estimatedHours: null },
], now).split('\r\n')
ok(timed.includes('DTSTART;TZID=Europe/Copenhagen:20261031T223000') && timed.includes('DTEND;TZID=Europe/Copenhagen:20261101T013000'), 'start + varighed over midnat')
ok(timed.includes('DTSTART;TZID=Europe/Copenhagen:20261020T080000') && timed.filter((l) => l.startsWith('DTEND')).length === 1, 'uden varighed: ingen DTEND')
ok(timed.includes('BEGIN:VTIMEZONE') && timed.includes('TZID:Europe/Copenhagen'), 'tidszone-blok med')

// W-9: opfølgning på lead — tidsbestemt, 15 min, alarm, tekst escapes
const fu = generateFollowUpICS({ id: 'lead-x', date: '2026-12-31', startTime: '23:50', title: 'Opfølgning: A, B', description: 'Tlf: 1\nlinje 2' }, now).split('\r\n')
ok(fu.includes('DTSTART;TZID=Europe/Copenhagen:20261231T235000') && fu.includes('DTEND;TZID=Europe/Copenhagen:20270101T000500'), 'opfølgning: 15 min over årsskifte')
ok(fu.includes('BEGIN:VALARM') && fu.includes('TRIGGER:PT0M') && fu.includes('SUMMARY:Opfølgning: A\\, B'), 'alarm + escapet titel')
ok(fu.includes('DESCRIPTION:Tlf: 1\\nlinje 2') && fu.includes('BEGIN:VTIMEZONE'), 'beskrivelse escapet + tidszone')
let threw = false
try { generateFollowUpICS({ id: 'x', date: '31-12-2026', startTime: '9', title: 't' }) } catch { threw = true }
ok(threw, 'ugyldig dato/tid afvises')

// TP-9 (2026-10-17): CR/CRLF escapes og linjer foldes til højst 75 oktetter
{
  const crIcs = generateWorkOrdersICS([{ id: 'cr1', date: '2026-10-20', title: 'Kunde A\r\nLinje 2\rLinje 3', description: 'æ'.repeat(60) }], now)
  const unfolded = crIcs.replace(/\r\n /g, '')
  ok(!/\r(?!\n)/.test(crIcs), 'ingen rå CR i filen')
  ok(unfolded.includes('SUMMARY:Kunde A\\nLinje 2\\nLinje 3'), 'CRLF og CR i titel escapes som \\n')
  const enc = new TextEncoder()
  ok(crIcs.split('\r\n').every((l) => enc.encode(l).length <= 75), 'alle linjer ≤ 75 oktetter (UTF-8)')
  ok(unfolded.includes(`DESCRIPTION:${'æ'.repeat(60)}`), 'foldet linje samles korrekt igen')
  ok(foldICSLine('kort') === 'kort', 'kort linje uændret')
}

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
