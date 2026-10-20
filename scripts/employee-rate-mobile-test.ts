/** Medarbejderens satser stables paa mobil. Formlen og felterne bliver. Koer: npx tsx scripts/employee-rate-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/employees/[id]/edit/edit-employee-form.tsx', 'utf8')

eq('grundsatser stables', src.includes('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'), true)
eq('tillæg stables', src.includes('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4'), true)
eq('timeloen bliver', src.includes("register('hourly_wage')"), true)
eq('salgspris bliver', src.includes("register('sales_rate')"), true)
eq('formlen bliver', src.includes('timeløn × (1 + pension+fritvalg+ferie+sh+overhead %) + sociale omkostninger'), true)
eq('stamdata stables stadig', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-4'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-rate-mobile-test OK')
process.exitCode = fail ? 1 : 0
