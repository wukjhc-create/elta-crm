/** Maanedskalenderen siger naar ansvarliges navn ikke kan hentes. Aftalerne bliver. Koer: npx tsx scripts/calendar-month-names-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const monthStart = page.indexOf("if (view === 'month')")
const month = page.slice(monthStart, page.indexOf('// ----- Day or Week view', monthStart))
eq('maaned findes', month.length > 80, true)
eq('flag kun uden listefejl', month.includes('const namesFailed = !tasksError && (!!allTasks.names_failed || !!assistantTasks.names_failed)'), true)
eq('fejl sendes stadig', month.includes('tasksError={tasksError}'), true)
eq('flag sendes', month.includes('namesFailed={namesFailed}'), true)

const view = fs.readFileSync('src/app/dashboard/calendar/calendar-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="calendar-assignee-names-error"') && view.includes('Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt.'), true)
eq('listefejl kommer foer navnebanner', view.indexOf('data-testid="calendar-tasks-load-error"') < view.indexOf('data-testid="calendar-assignee-names-error"'), true)
eq('navn vises naar det findes', view.includes('task.assigned_profile.full_name || task.assigned_profile.email'), true)
eq('fejlet navn er ikke skjult', view.includes('namesFailed && task.assigned_to'), true)
eq('fejlet navn har egen tekst', view.includes('Navn kunne ikke hentes'), true)
eq('aftalefejl bliver', view.includes('Det tælles ikke som ingen aftaler.'), true)

const workforce = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
eq('jobkortets ikke tildelt bliver', workforce.includes("wo.employee?.name || 'Ikke tildelt'"), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-month-names-test OK')
process.exitCode = fail ? 1 : 0
