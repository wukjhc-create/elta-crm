/** Mobilkort på medarbejderlisten. Kør: npx tsx scripts/employees-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const file = 'src/app/dashboard/employees/employees-list-client.tsx'
const text = fs.readFileSync(file, 'utf8')
const start = 'data-testid="employees-mobile-list"'
const end = 'hidden md:block'
const a = text.indexOf(start)
const b = text.indexOf(end, a + start.length)
const mobile = a >= 0 && b > a ? text.slice(a, b) : ''

eq('medarbejderkort findes', mobile.length > 0, true)
eq('kortet linker til medarbejderen', mobile.includes('/dashboard/employees/${e.id}'), true)
eq('mail og telefon er egne links', mobile.includes('mailto:') && mobile.includes('tel:'), true)
eq('navnelinket lukkes før mailen', mobile.indexOf('</Link>') < mobile.indexOf('mailto:'), true)
eq('løn vises kun med samme gate', mobile.includes('canSeePayroll') && mobile.includes('cost_rate') && mobile.includes('hourly_rate'), true)
eq('tabellen er skjult på mobil', text.includes('hidden md:block'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployees-mobile-test OK')
process.exitCode = fail ? 1 : 0
