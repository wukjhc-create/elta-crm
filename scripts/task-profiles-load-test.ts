/** Ansvarlig-listen siger naar medarbejdere ikke kan hentes. Opgaver og et aegte tomt valg bliver. Koer: npx tsx scripts/task-profiles-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getActiveProfiles'), action.indexOf('export async function createCustomerTask'))
eq('funktion findes', fn.length > 80, true)
eq('uden ret er tom', fn.includes('if (!allowed) return []'), true)
eq('tom foer kast', fn.indexOf('if (!allowed) return []') < fn.indexOf("throw new Error('Kunne ikke hente medarbejdere')"), true)
eq('query kaster', fn.includes("throw new Error('Kunne ikke hente medarbejdere')"), true)
eq('auth-mail bliver', fn.includes('ikke-kritisk'), true)

const msg = 'Medarbejdere kunne ikke hentes. Det tælles ikke som ingen.'
const tasks = fs.readFileSync('src/app/dashboard/tasks/tasks-page-client.tsx', 'utf8')
eq('opgaveliste siger det', tasks.includes(msg) && tasks.includes('data-testid="task-profiles-load-error"'), true)
eq('opgaver beholdes', tasks.indexOf('if (tasksData.error)') < tasks.indexOf('setTasks(tasksData.tasks)'), true)
eq('fejl rydder ikke profiler', tasks.includes('if (profilesResult.failed)') && tasks.indexOf('setProfilesError(') < tasks.indexOf('setProfiles(profilesResult.rows)'), true)
eq('opgavefejl bliver', tasks.includes('data-testid="tasks-list-load-error"'), true)

const customer = fs.readFileSync('src/components/modules/customers/customer-tasks.tsx', 'utf8')
eq('kundekort siger det', customer.includes(msg) && customer.includes('data-testid="customer-task-profiles-error"'), true)
eq('opgaver foerst', customer.indexOf('setLoadError(null)') < customer.indexOf('setTasks(tasksData.tasks)'), true)
eq('opgavefejl paa kort bliver', customer.includes('data-testid="customer-tasks-load-error"'), true)
eq('udfoer bliver', customer.includes('completeCustomerTask(taskId)'), true)

const offer = fs.readFileSync('src/components/modules/offers/offer-task-form.tsx', 'utf8')
eq('tilbud siger det', offer.includes(msg) && offer.includes('data-testid="offer-task-profiles-error"'), true)
eq('mig selv bliver', offer.includes('>Mig selv<'), true)

console.log(fail ? `\n${fail} fejl` : '\ntask-profiles-load-test OK')
process.exitCode = fail ? 1 : 0
