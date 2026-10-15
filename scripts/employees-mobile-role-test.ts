/** Medarbejderkortet ombryder navn, nummer og rolle. Loen og mail bliver. Koer: npx tsx scripts/employees-mobile-role-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const text = fs.readFileSync('src/app/dashboard/employees/employees-list-client.tsx', 'utf8')
const start = text.indexOf('data-testid="employees-mobile-list"')
const mobile = text.slice(start, text.indexOf('hidden md:block', start))

eq('navn og nummer ombrydes', mobile.includes('flex flex-wrap items-baseline gap-x-2 gap-y-0.5'), true)
eq('nummer ombrydes', mobile.includes('font-mono break-all">{e.employee_number}'), true)
eq('rolle ombrydes', mobile.includes('text-sm text-gray-700 break-words">{roleLabel(e.role)}'), true)
eq('mail bliver', mobile.includes('mailto:'), true)
eq('loen-gate bliver', mobile.includes('canSeePayroll && ('), true)
eq('kost bliver', mobile.includes('fmtAmount(e.cost_rate)') && mobile.includes('fmtAmount(e.hourly_rate)'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployees-mobile-role-test OK')
process.exitCode = fail ? 1 : 0
