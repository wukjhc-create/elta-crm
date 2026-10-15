/** Ret medarbejder: ansaettelsesdatoer kan krympe. Satserne bliver. Koer: npx tsx scripts/employee-edit-date-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/employees/[id]/edit/edit-employee-form.tsx', 'utf8')
eq('stamdata kan krympe', src.split('grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0').length - 1 === 4, true)
eq('dato kan krympe', src.split('type="date"').length - 1 === 2 && src.includes('className={`${input} min-w-0 max-w-full`}'), true)
eq('ansaettelse bliver', src.includes("register('hire_date')"), true)
eq('fratraedelse bliver', src.includes("register('termination_date')"), true)
eq('timeloen bliver', src.includes("register('hourly_wage')"), true)
eq('salgspris bliver', src.includes("register('sales_rate')"), true)
eq('formlen bliver', src.includes('timeløn × (1 + pension+fritvalg+ferie+sh+overhead %) + sociale omkostninger'), true)
eq('felt kan krympe', src.includes('space-y-1 min-w-0'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-edit-date-mobile-test OK')
process.exitCode = fail ? 1 : 0
