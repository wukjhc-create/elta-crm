/** Ugevisningen paa mobil naevner ledige, naar dagen har andre job. Tom tekst bliver. Koer: npx tsx scripts/calendar-week-free-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
const start = src.indexOf('data-testid="calendar-week-mobile"')
const week = src.slice(start, src.indexOf('hidden md:block', start))
eq('uge-listen findes', week.includes('data-testid="calendar-week-mobile"'), true)
eq('ledige naevnes', week.includes('data-testid="calendar-week-free"') && week.includes('Uden job denne dag:'), true)
eq('filterforklaring bliver med', week.includes('Tomme navne kan skyldes filtrene.'), true)
eq('helt tom dag bliver', week.includes('Ingen planlagte job denne dag'), true)
eq('jobkortet bliver', week.includes('<WorkOrderChip key={wo.id} wo={wo} />'), true)
eq('ikke tildelt bliver', week.includes('Ikke tildelt'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-week-free-test OK')
process.exitCode = fail ? 1 : 0
