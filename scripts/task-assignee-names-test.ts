/** Ansvarliges navn siger naar opslaget fejler. Opgaverne bliver. Ikke tildelt bliver naar der ikke er en ansvarlig. Koer: npx tsx scripts/task-assignee-names-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const enrichStart = action.indexOf('async function enrichWithProfiles')
const enrichEnd = action.indexOf('export async function getCustomerTasks')
const enrich = action.slice(enrichStart, enrichEnd)
eq('funktion findes', enrich.length > 80, true)
eq('ingen ansvarlig er ikke en fejl', enrich.includes('if (assignedIds.length === 0) return { tasks, names_failed: false }'), true)
eq('fejl kommer foer tomt navn', enrich.indexOf('if (profilesErr)') < enrich.indexOf('assigned_profile:'), true)
eq('fejl beholder opgaverne', enrich.includes('return { tasks, names_failed: true }'), true)
eq('auth-mail bliver', enrich.includes('ikke-kritisk'), true)

const allStart = action.indexOf('export async function getAllTasks')
const allEnd = action.indexOf('export async function getMyDayTasks')
const all = action.slice(allStart, allEnd)
eq('listen faar flaget', all.includes('names_failed: enriched.names_failed'), true)
eq('montor uden id bliver tom', all.includes('if (!userId) return { tasks: [], error: null }'), true)

const remStart = action.indexOf('export async function getMyPendingReminders')
const remEnd = action.indexOf('export async function getActiveProfiles')
const rem = action.slice(remStart, remEnd)
eq('paamindelse bliver et array', rem.includes('return enriched.tasks'), true)
eq('paamindelse kaster stadig', rem.includes("throw new Error('Kunne ikke hente påmindelser')"), true)

const doneStart = action.indexOf('export async function completeCustomerTask')
const done = action.slice(doneStart, doneStart + 900)
eq('udfoer saetter done', done.includes("status: 'done'"), true)
eq('udfoer saetter completed_at', done.includes('completed_at:'), true)

const list = fs.readFileSync('src/app/dashboard/tasks/tasks-page-client.tsx', 'utf8')
eq('listen siger det', list.includes('data-testid="task-assignee-names-error"') && list.includes('Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt.'), true)
eq('banner kun uden listefejl', list.includes('!tasksError && namesFailed'), true)
eq('ikke tildelt bliver', list.includes('Ikke tildelt'), true)
eq('navn skjules ikke som ikke tildelt', list.includes("namesFailed && task.assigned_to ? 'Navn kunne ikke hentes' : 'Ikke tildelt'"), true)
eq('opgaver beholdes', list.indexOf('if (tasksData.error)') < list.indexOf('setTasks(tasksData.tasks)'), true)

const customer = fs.readFileSync('src/components/modules/customers/customer-tasks.tsx', 'utf8')
eq('kundekort siger det', customer.includes('data-testid="customer-task-assignee-names-error"'), true)
eq('kundekort bevarer raekkefoelgen', customer.indexOf('setLoadError(null)') < customer.indexOf('setTasks(tasksData.tasks)'), true)

const tab = fs.readFileSync('src/app/dashboard/orders/[id]/order-tasks-tab.tsx', 'utf8')
eq('sagen siger det', tab.includes('data-testid="case-task-assignee-names-error"'), true)
eq('sagen nulstiller ikke', !tab.includes('setTasks([])'), true)
eq('sagen bevarer opgaverne', tab.includes('setTasks(result.tasks)'), true)

console.log(fail ? `\n${fail} fejl` : '\ntask-assignee-names-test OK')
process.exitCode = fail ? 1 : 0
