/** Mine opgaver siger naar hentningen fejler. Tomme saetninger og split bliver. Koer: npx tsx scripts/my-day-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const start = action.indexOf('export async function getMyDayTasks')
const next = action.indexOf('export async function getTaskCounts')
const body = action.slice(start, next === -1 ? start + 2500 : next)
eq('auth-fejl er ikke en tom dag', body.includes("error: 'Kunne ikke hente opgaver'"), true)
eq('query-fejl er ikke en tom dag', body.split("error: 'Kunne ikke hente opgaver'").length >= 3, true)
eq('rigtig tom dag har error null', body.includes('error: null'), true)
eq('split bliver', body.includes('splitMyDayTasks(mapped, userId)'), true)
eq('kun egne aabne opgaver', body.includes(".eq('assigned_to', userId)") && body.includes(".neq('status', 'done')"), true)

const view = fs.readFileSync('src/components/modules/dashboard/my-day-tasks.tsx', 'utf8')
eq('kortet siger fejl', view.includes('data-testid="my-day-load-error"') && view.includes('Det tælles ikke som ingen opgaver.'), true)
eq('tom forfalden bliver', view.includes('Ingen forfaldne opgaver.'), true)
eq('tom i dag bliver', view.includes('Ingen opgaver i dag.'), true)
eq('fejlen skjuler den tomme saetning', view.includes('suppressEmpty ? null :'), true)

const dash = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
eq('dashboardet sender fejlen', dash.includes('loadError={tasks.error}'), true)
const tasksPage = fs.readFileSync('src/app/dashboard/tasks/page.tsx', 'utf8')
eq('opgavesiden sender fejlen', tasksPage.includes('loadError={myDay.error}'), true)

console.log(fail ? `\n${fail} fejl` : '\nmy-day-load-test OK')
process.exitCode = fail ? 1 : 0
