/** Medarbejderlisten siger naar hentningen fejler. Tom liste, tilladelse og timer bliver. Koer: npx tsx scripts/employee-select-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const fnStart = action.indexOf('export async function getEmployeesForOrderSelect')
const fnEnd = action.indexOf('export async function getOffersForOrderSelect')
const fn = action.slice(fnStart, fnEnd)
const errAt = fn.indexOf('if (error)')
const err = fn.slice(errAt, fn.indexOf('const list'))

eq('funktionen findes', fnStart > 0 && fnEnd > fnStart, true)
eq('queryfejl er ikke en tom liste', err.includes('success: false') && err.includes('Kunne ikke hente medarbejdere') && !err.includes('data: []'), true)
eq('tilladelse bliver afvist', fn.includes("error: 'Manglende tilladelse: employees.view'"), true)
eq('rigtig tom liste bliver', fn.includes('return { success: true, data: list }'), true)
eq('montor ser kun sig selv', fn.includes('ownOnly') && fn.includes("q.eq('profile_id', userId)"), true)

const plan = fs.readFileSync('src/app/dashboard/orders/[id]/order-planning-tab.tsx', 'utf8')
eq('planen siger medarbejderfejl', plan.includes('data-testid="planning-employees-load-error"') && plan.includes('Det tælles ikke som ingen medarbejdere.'), true)
eq('planen siger timefejl', plan.includes('data-testid="case-time-load-error"') && plan.includes('Det tælles ikke som at tiden er registreret.'), true)
eq('planen rydder ikke en god liste', plan.includes('else if (!empRes.success)') && !plan.includes('setEmployees([])'), true)
eq('kostformlen bliver', plan.includes('Number(l.hours) * Number(l.employee.hourly_rate)'), true)
eq('ingen tildelt bliver', plan.includes('— Ingen tildelt —'), true)
eq('tom plan bliver', plan.includes('Ingen arbejdsordrer planlagt endnu'), true)

const created = fs.readFileSync('src/app/dashboard/orders/new/new-order-form.tsx', 'utf8')
const edited = fs.readFileSync('src/app/dashboard/orders/[id]/edit/edit-order-form.tsx', 'utf8')
const newPage = fs.readFileSync('src/app/dashboard/orders/new/page.tsx', 'utf8')
const editPage = fs.readFileSync('src/app/dashboard/orders/[id]/edit/page.tsx', 'utf8')
for (const [name, src, page] of [['ny', created, newPage], ['ret', edited, editPage]] as const) {
  eq(`${name} siger fejl`, src.includes('data-testid="order-employees-load-error"') && src.includes('Det tælles ikke som ingen medarbejdere.'), true)
  eq(`${name} ingen formand bliver`, src.includes('— Ingen formand —'), true)
  eq(`${name} kun ved fejl`, page.includes('employeesError={employeesRes.success ? null : (employeesRes.error ?? \'Kunne ikke hente medarbejdere\')}'), true)
}

const logs = fs.readFileSync('src/app/dashboard/orders/[id]/work-order-time-logs.tsx', 'utf8')
eq('timer siger medarbejderfejl', logs.includes('data-testid="time-log-employees-load-error"') && logs.includes('Det tælles ikke som ingen medarbejdere.'), true)
eq('en montor vaelges stadig', logs.includes('empRes.data.length === 1'), true)
eq('vaelg bliver', logs.includes('— vælg —'), true)
eq('kost-gate bliver', logs.includes('canSeeCost && totalCost > 0'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-select-load-test OK')
process.exitCode = fail ? 1 : 0
