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

console.log(fail ? `\n${fail} fejl` : '\ncalendar-mobile-test OK')
process.exitCode = fail ? 1 : 0
