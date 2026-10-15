/** Sagens opgaver siger naar hentningen fejler. Tom tekst og udfoer bliver. Koer: npx tsx scripts/case-tasks-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const start = action.indexOf('export async function getServiceCaseTasks')
const next = action.indexOf('export async function getAllTasks')
const body = action.slice(start, next === -1 ? start + 1800 : next)
eq('auth kaster', body.includes("throw new Error('Kunne ikke hente opgaver')"), true)
eq('query kaster', body.split("throw new Error('Kunne ikke hente opgaver')").length >= 3, true)
eq('manglende tilladelse bliver tom', body.includes('return { tasks: [], names_failed: false }'), true)
eq('sagens opgaver bliver', body.includes(".eq('service_case_id', caseId)"), true)

const tab = fs.readFileSync('src/app/dashboard/orders/[id]/order-tasks-tab.tsx', 'utf8')
eq('fanen siger det ikke er ingen opgaver', tab.includes('Kunne ikke hente opgaver. Det tælles ikke som ingen opgaver.'), true)
eq('opgaver beholdes ved fejl', !tab.includes('setTasks([])'), true)
eq('fejlen skjuler den tomme tekst', tab.includes('error && tasks.length === 0'), true)
eq('tom tekst bliver', tab.includes('Ingen opgaver endnu'), true)
eq('udfoer bliver', tab.includes('completeCustomerTask(taskId)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-tasks-load-test OK')
process.exitCode = fail ? 1 : 0
