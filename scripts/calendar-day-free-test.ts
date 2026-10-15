/** Dagsvisningen paa mobil viser ogsaa ledige medarbejdere. Jobkortet bliver. Koer: npx tsx scripts/calendar-day-free-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
const day = src.slice(src.indexOf('data-testid="calendar-day-mobile"'), src.indexOf('hidden md:block bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto'))
eq('mobil-listen findes', day.includes('data-testid="calendar-day-mobile"'), true)
eq('ledig medarbejder siges', day.includes('Ingen opgaver i dag'), true)
eq('ledige skjules ikke', day.includes('return null'), false)
eq('jobkortet bliver', day.includes('<WorkOrderChip key={wo.id} wo={wo} />'), true)
eq('ikke tildelt bliver', day.includes('Ikke tildelt'), true)
const chip = src.slice(src.indexOf('function WorkOrderChip'))
eq('jobkort bliver afkortet', chip.includes('font-medium truncate'), true)
eq('dansk i dag bliver', src.slice(src.indexOf('function todayKey'), src.indexOf('function todayKey') + 220).includes('copenhagenParts(new Date()).date'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-day-free-test OK')
process.exitCode = fail ? 1 : 0
