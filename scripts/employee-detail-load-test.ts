/** Medarbejderkortet siger naar hentningen fejler. Ikke-fundet og satser bliver. Koer: npx tsx scripts/employee-detail-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/employees.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getEmployeeAction'), action.indexOf('export async function getEmployeeProjectImpactAction'))
eq('funktion findes', fn.length > 80, true)
eq('query kaster', fn.includes("throw new Error('Kunne ikke hente medarbejderen')"), true)
eq('fejl foer mangler', fn.indexOf('if (error)') < fn.indexOf('if (!emp) return null'), true)
eq('mangler bliver null', fn.includes('if (!emp) return null'), true)
eq('uden ret bliver null', fn.includes("if (!hasPermission('employees.view')) return null"), true)
eq('satser bliver', fn.includes('hourly_rate: canSeePayroll ? normalised.hourly_rate : null'), true)

const msg = 'Kunne ikke hente medarbejderen. Det tælles ikke som at personen ikke findes.'
const detail = fs.readFileSync('src/app/dashboard/employees/[id]/page.tsx', 'utf8')
eq('kort siger det', detail.includes(msg) && detail.includes('data-testid="employee-detail-load-error"'), true)
eq('kort ikke-fundet bliver', detail.includes('if (!employee) notFound()'), true)
const edit = fs.readFileSync('src/app/dashboard/employees/[id]/edit/page.tsx', 'utf8')
eq('rediger siger det', edit.includes(msg) && edit.includes('data-testid="employee-edit-load-error"'), true)
eq('rediger ikke-fundet bliver', edit.includes('if (!employee) notFound()'), true)
eq('loen foldes stadig', edit.includes('includeCompensation: false'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-detail-load-test OK')
process.exitCode = fail ? 1 : 0
