/** Kalenderens dag og uge på små skærme, og "I dag" i dansk tid. Kør: npx tsx scripts/calendar-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
const todayFn = src.slice(src.indexOf('function todayKey'), src.indexOf('function todayKey') + 220)

eq('i dag bruger dansk kalenderdag', todayFn.includes('copenhagenParts(new Date()).date'), true)
eq('i dag bruger ikke browserens lokale dato', todayFn.includes('dateKey(new Date())'), false)
eq('dagsvisning har mobil-liste', src.includes('data-testid="calendar-day-mobile"'), true)
eq('ugevisning har mobil-liste', src.includes('data-testid="calendar-week-mobile"'), true)
eq('uge-tabellen er skjult under md', src.includes('hidden md:block bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto'), true)
const nav = src.slice(src.indexOf('{/* Date nav */}'), src.indexOf('<CalendarAgenda'))
const filters = src.slice(src.indexOf('{/* Filters */}'), src.indexOf('Nulstil filtre'))
eq('datonav ombrydes', nav.includes('flex-wrap') && nav.includes("aria-label={view === 'week' ? 'Forrige uge' : 'Forrige dag'}") && nav.includes("aria-label={view === 'week' ? 'Næste uge' : 'Næste dag'}"), true)
eq('dato har et navn', nav.includes('aria-label="Dato"'), true)
eq('filtre fylder bredden paa mobil', filters.includes('w-full sm:w-auto') && filters.split('w-full sm:w-auto').length >= 3, true)
eq('medarbejder har et navn', filters.includes('aria-label="Medarbejder"'), true)
eq('status har et navn', filters.includes('aria-label="Status"'), true)
eq('nulstil er en knap', src.slice(Math.max(0, src.indexOf('Nulstil filtre') - 400), src.indexOf('Nulstil filtre')).includes('type="button"'), true)
const chip = src.slice(src.indexOf('function WorkOrderChip'))
eq('jobkort viser ansvarlig', chip.includes('wo.employee?.name') && chip.includes('Ikke tildelt') && chip.includes('!compact'), true)
eq('jobkort har et navn', chip.includes('aria-label={chipName}'), true)
eq('jobkort bliver afkortet', chip.includes('font-medium truncate'), true)
eq('tom uge-dag siger at der ikke er job', src.includes('Ingen planlagte job denne dag'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-mobile-test OK')
process.exitCode = fail ? 1 : 0
