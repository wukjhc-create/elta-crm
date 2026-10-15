/** Tom kalender siger det, når filtrene skjuler job. Ufiltreret tekst og data bliver. Kør: npx tsx scripts/calendar-filter-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
eq('dagen kender filtrene', src.includes('filtersActive={Boolean(filters.employee || filters.status)}'), true)
eq('filtreret dag siger nulstil', src.includes('Ingen arbejdsordrer matcher filtrene denne dag. Nulstil filtrene for at se resten.'), true)
eq('ufiltreret dag bliver', src.includes('Der er ikke planlagt nogen arbejdsordrer for'), true)
eq('filtreret uge siger filter', src.includes("filtersActive ? 'Ingen job matcher filtrene.' : 'Ingen planlagte job denne dag'"), true)
eq('arbejdsordrer taelles stadig', src.includes('filteredWOs.length'), true)
eq('uge-bordet siger filtret', src.includes('Tomme celler kan skyldes filtrene. Nulstil filtrene for at se resten.'), true)
eq('ugechips bliver afkortet', src.includes('truncate'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-filter-empty-test OK')
process.exitCode = fail ? 1 : 0
