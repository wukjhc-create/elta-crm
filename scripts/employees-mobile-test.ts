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
eq('navn ombrydes', mobile.includes('break-words'), true)
eq('mail ombrydes', mobile.includes('break-all'), true)
eq('soegning fylder bredden', text.includes('w-full sm:w-64') && text.includes('aria-label="Søg medarbejdere"'), true)
eq('overskriften ombrydes', text.includes('flex flex-wrap items-start justify-between gap-3'), true)

const jobs = fs.readFileSync('src/app/dashboard/employees/[id]/employee-tabs.tsx', 'utf8')
eq('jobtitel ombrydes', jobs.includes('break-words min-w-0 flex-1">{j.title ?? \'Job\'}'), true)
eq('tom jobliste bliver', jobs.includes('Ingen job tildelt.'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployees-mobile-test OK')
process.exitCode = fail ? 1 : 0
