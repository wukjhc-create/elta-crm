/** Medarbejderlisten og kalenderen siger naar hentningen fejler. Tom tekst og satser bliver. Koer: npx tsx scripts/employee-list-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke hente medarbejdere. Det tælles ikke som ingen.'
const action = fs.readFileSync('src/lib/actions/employees.ts', 'utf8')
const list = action.slice(action.indexOf('export async function listEmployeesAction'), action.indexOf('export async function listCalendarEmployeesAction'))
const cal = action.slice(action.indexOf('export async function listCalendarEmployeesAction'), action.indexOf('export async function getEmployeeAction'))
eq('liste findes', list.length > 80, true)
eq('liste kaster', list.includes("throw new Error('Kunne ikke hente medarbejdere')"), true)
eq('liste fejl foer tom', list.indexOf('if (error)') < list.indexOf('return (data ?? [])'), true)
eq('uden ret er tom', list.includes("if (!hasPermission('employees.view')) return []"), true)
eq('satser bliver skjult', list.includes('hourly_rate: null, cost_rate: null'), true)
eq('kalender kaster', cal.includes("throw new Error('Kunne ikke hente medarbejdere')"), true)
eq('montor uden ret er tom', cal.includes("if (!hasPermission('calendar.view.own')) return []"), true)
eq('planlaegger ser alle', cal.includes("return listEmployeesAction({ active: 'active', limit: 200 })"), true)

const page = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
eq('kalender siger det', page.includes(msg), true)
eq('job bliver', page.includes('listWorkOrdersByDateRange(rangeStart, rangeEnd)'), true)

const view = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
eq('kalender-testid', view.includes('data-testid="calendar-employees-load-error"'), true)
eq('fejl skjuler tom', view.includes('!employeesError && employeesWithRows.length === 0'), true)
eq('ingen aktive bliver', view.includes('Ingen aktive medarbejdere'), true)
eq('ikke koblet bliver', view.includes('Din bruger er ikke koblet til en medarbejder'), true)

const listPage = fs.readFileSync('src/app/dashboard/employees/page.tsx', 'utf8')
eq('oversigt siger det', listPage.includes(msg), true)
const listView = fs.readFileSync('src/app/dashboard/employees/employees-list-client.tsx', 'utf8')
eq('oversigt-testid', listView.includes('data-testid="employees-list-load-error"'), true)
eq('tom tekst bliver', listView.includes('Ingen medarbejdere endnu'), true)
eq('filtertekst bliver', listView.includes('Ingen medarbejdere matcher filtrene'), true)

console.log(fail ? `\n${fail} fejl` : '\nemployee-list-load-test OK')
process.exitCode = fail ? 1 : 0
