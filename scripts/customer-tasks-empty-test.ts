/** Kundens opgaver: tom tilstand forklarer naeste skridt. Koer: npx tsx scripts/customer-tasks-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-tasks.tsx', 'utf8')
const start = src.indexOf('data-testid="customer-tasks-empty"')
const end = src.indexOf('activeTasks.map')
const empty = src.slice(start, end)

eq('tom tilstand findes', start > 0 && end > start, true)
eq('teksten siger hvad man goer', empty.includes('Opret en opgave, hvis der skal følges op på kunden.'), true)
eq('knappen aabner den samme form', empty.includes('setShowForm(true)') && empty.includes('setEditingTask(null)'), true)
eq('kun udfoerte siges hoejt', src.includes('Ingen åbne opgaver. Udførte ligger nedenfor.'), true)
eq('loader-teksten er der stadig', src.includes('Ingen opgaver endnu'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-tasks-empty-test OK')
process.exitCode = fail ? 1 : 0
