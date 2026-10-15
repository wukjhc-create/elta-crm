/** Inaktive medarbejdere med nul traef staar som filtertom, ikke som ingen medarbejdere endnu. Koer: npx tsx scripts/employees-status-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/employees/employees-list-client.tsx', 'utf8')
eq('status taeller som filter', src.includes("filters.q || filters.role || (filters.active && filters.active !== 'active')"), true)
eq('filtertekst bliver', src.includes('Ingen medarbejdere matcher filtrene'), true)
eq('aegte tom liste bliver', src.includes('Ingen medarbejdere endnu'), true)
eq('opret skjules ved filter', src.includes('{!hasFilters && ('), true)
eq('standard er kun aktive', src.includes("value={filters.active ?? 'active'}"), true)
eq('nulstil bliver', src.includes("router.push('/dashboard/employees')"), true)

console.log(fail ? `\n${fail} fejl` : '\nemployees-status-empty-test OK')
process.exitCode = fail ? 1 : 0
