/** Tom efterkalkulation kan nulstille filtrene. Tallene er de samme. Koer: npx tsx scripts/aftercalc-empty-filter-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const empty = src.slice(src.indexOf('data-testid="aftercalc-empty"'), src.indexOf('data-testid="aftercalc-overview-mobile"'))

eq('tom liste skelner filter', empty.includes('Ingen sager matcher filtrene.') && empty.includes('Ingen sager i oversigten.'), true)
eq('tom oversigt siger naeste skridt', empty.includes('Opret en sag fra kunden, så den kan efterkalkuleres her.'), true)
eq('nulstil bruger standardfiltrene', src.includes("setFilters({ sort: 'worst_db', page: 1, variance: 'all' })"), true)
eq('nulstil-knap har et testid', empty.includes('data-testid="aftercalc-clear-filters"'), true)
eq('titel paa kortet ombrydes', src.slice(src.indexOf('data-testid="aftercalc-overview-mobile"'), src.indexOf('hidden md:block overflow-x-auto')).includes('break-words'), true)

console.log(fail ? `\n${fail} fejl` : '\naftercalc-empty-filter-test OK')
process.exitCode = fail ? 1 : 0
