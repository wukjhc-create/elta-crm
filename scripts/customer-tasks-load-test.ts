/** Kundens opgaver siger naar hentningen fejler. Tom tekst og tilladelse bliver. Koer: npx tsx scripts/customer-tasks-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const start = action.indexOf('export async function getCustomerTasks')
const next = action.indexOf('export async function getServiceCaseTasks')
const body = action.slice(start, next === -1 ? start + 1600 : next)
eq('query kaster', body.includes("throw new Error('Kunne ikke hente opgaver')"), true)
eq('manglende tilladelse bliver tom', body.includes("if (await gateDenied('customers.view')) return { tasks: [], names_failed: false }"), true)
eq('ugyldigt id bliver tomt', body.includes("if (!/^[0-9a-f-]{36}$/i.test(customerId)) return { tasks: [], names_failed: false }"), true)

const view = fs.readFileSync('src/components/modules/customers/customer-tasks.tsx', 'utf8')
eq('kortet siger fejl', view.includes('data-testid="customer-tasks-load-error"') && view.includes('Det tælles ikke som ingen opgaver.'), true)
eq('fejl skjuler den tomme tekst', view.includes('loadError && tasks.length === 0'), true)
eq('fejl nulstiller ikke listen', view.indexOf('setLoadError(') < view.indexOf('setTasks(tasksData.tasks)'), true)
eq('tom tekst bliver', view.includes('Ingen opgaver endnu'), true)
eq('naeste skridt bliver', view.includes('Opret en opgave, hvis der skal følges op på kunden.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-tasks-load-test OK')
process.exitCode = fail ? 1 : 0
