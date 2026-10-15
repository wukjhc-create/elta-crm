/** Ny medarbejder: ansaettelsesdatoer kan krympe. Register bliver. Koer: npx tsx scripts/employee-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/employees/new/new-employee-form.tsx', 'utf8')
const dateClass = 'w-full min-w-0 max-w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary'
eq('gitre kan krympe', src.split('grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0').length - 1 === 3, true)
eq('dato kan krympe', src.split('type="date"').length - 1 === 2 && src.split(dateClass).length - 1 === 2, true)
eq('ansaettelse bliver', src.includes("register('hire_date')"), true)
eq('fratraedelse bliver', src.includes("register('termination_date')"), true)
eq('felt kan krympe', src.includes('space-y-1 min-w-0'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
