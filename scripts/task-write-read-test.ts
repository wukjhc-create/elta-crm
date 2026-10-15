/** Opgave-aendring siger naar opgaven ikke kan laeses. Den aendres ikke. Koer: npx tsx scripts/task-write-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læse opgaven. Den er ikke ændret.'
const src = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const start = src.indexOf('async function taskWriteDenied')
const end = src.indexOf('async function enrichWithProfiles')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('laesning siger fejl foer ikke-fundet', fn.indexOf('if (error)') < fn.indexOf("return 'Opgaven blev ikke fundet'"), true)
eq('tekst', fn.includes(msg), true)
eq('redigeringsret bliver foer laesningen', fn.indexOf("hasPermission('customers.edit')") < fn.indexOf('if (error)'), true)
eq('egne opgaver bliver', fn.includes('Du kan kun ændre dine egne opgaver'), true)
eq('ugyldigt id bliver', fn.includes("return 'Ugyldigt opgave-id'"), true)

const complete = src.slice(src.indexOf('export async function completeCustomerTask'), src.indexOf('export async function deleteCustomerTask'))
eq('afslut skriver stadig done', complete.includes("status: 'done'") && complete.includes('completed_at:'), true)
eq('afslut kalder stadig vagten', complete.includes('taskWriteDenied(taskId)'), true)

console.log(fail ? `\n${fail} fejl` : '\ntask-write-read-test OK')
process.exitCode = fail ? 1 : 0
