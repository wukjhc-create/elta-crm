/** Opgavelisten siger naar hentningen fejler. Tomme tekster og montor-scope bliver. Koer: npx tsx scripts/tasks-list-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const start = action.indexOf('export async function getAllTasks')
const next = action.indexOf('export async function getMyDayTasks')
const body = action.slice(start, next === -1 ? start + 2800 : next)
eq('auth-fejl er ikke tom liste', body.includes("error: 'Kunne ikke hente opgaver'"), true)
eq('query-fejl er ikke tom liste', body.split("error: 'Kunne ikke hente opgaver'").length >= 3, true)
eq('montor uden id bliver tom', body.includes('if (!userId) return { tasks: [], error: null }'), true)
eq('montor-scope bliver', body.includes(".eq('assigned_to', userId)"), true)

const view = fs.readFileSync('src/app/dashboard/tasks/tasks-page-client.tsx', 'utf8')
eq('listen siger fejl', view.includes('data-testid="tasks-list-load-error"') && view.includes('Det tælles ikke som ingen opgaver.'), true)
eq('fejl skjuler den tomme tekst', view.includes('tasksError && tasks.length === 0 ? null : visibleTasks.length === 0'), true)
eq('fejl nulstiller ikke listen', view.indexOf('if (tasksData.error)') < view.indexOf('setTasks(tasksData.tasks)'), true)
eq('tomt filter bliver', view.includes('Ingen opgaver matcher filteret'), true)
eq('tom montor bliver', view.includes('Ingen tildelte opgaver'), true)
eq('tom liste bliver', view.includes('Ingen opgaver fundet'), true)

const month = fs.readFileSync('src/app/dashboard/calendar/calendar-client.tsx', 'utf8')
eq('maaned siger fejl', month.includes('data-testid="calendar-tasks-load-error"') && month.includes('Det tælles ikke som ingen aftaler.'), true)
const agenda = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
eq('dagsorden siger fejl', agenda.includes('data-testid="calendar-agenda-load-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\ntasks-list-load-test OK')
process.exitCode = fail ? 1 : 0
