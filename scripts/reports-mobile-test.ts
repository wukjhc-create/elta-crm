/** Rapporter på små skærme. Kør: npx tsx scripts/reports-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
const between = (from: string, to: string) => {
  const start = src.indexOf(from)
  const end = src.indexOf(to, start + from.length)
  return { start, end, text: src.slice(start, end) }
}
const customers = between('data-testid="report-customers-mobile"', 'hidden md:block overflow-x-auto')
const profit = between('data-testid="report-profit-mobile"', 'hidden md:block overflow-x-auto')
const team = between('data-testid="report-team-mobile"', 'hidden md:block overflow-x-auto')
const offered = profit.text.indexOf('Tilbudt kost')

eq('kundekort findes foer tabellen', customers.start > 0 && customers.end > customers.start, true)
eq('kundekort viser tilbud og omsaetning', customers.text.includes('total_offers') && customers.text.includes('total_revenue'), true)
eq('sagsrentabilitet har kort foer tabellen', profit.start > 0 && profit.end > profit.start, true)
eq('kost paa sagskortet kraever costOpen', offered > profit.text.lastIndexOf('{costOpen && (', offered) && profit.text.lastIndexOf('{costOpen && (', offered) > 0, true)
eq('U88-testid ligger ikke paa kortet', profit.text.includes('report-case-deviation') || profit.text.includes('report-case-realized'), false)
eq('desktop-raekken beholder afvigelse og realiseret db', src.includes('data-testid="report-case-deviation"') && src.includes('data-testid="report-case-realized"'), true)
eq('sortering har ét testid', src.split('data-testid="report-sort-deviation"').length - 1, 1)
eq('teamkort viser timer og udnyttelse', team.text.includes('total_hours') && team.text.includes('billable_percentage'), true)
eq('sagsnavn ombrydes', profit.text.includes('break-words">{p.project_name}'), true)
eq('afvigelse-filter ombrydes', src.includes('flex flex-wrap items-center gap-2') && src.includes('data-testid="report-sort-deviation"'), true)
eq('noegletal ombrydes', src.includes('text-xs text-gray-500 break-words">{label}'), true)

console.log(fail ? `\n${fail} fejl` : '\nreports-mobile-test OK')
process.exitCode = fail ? 1 : 0
