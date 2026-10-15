/** Kundeopgavens raekke ombryder titlen, og udfoert har et navn. Koer: npx tsx scripts/customer-task-row-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-tasks.tsx', 'utf8')
const row = src.slice(src.indexOf('function TaskRow'), src.indexOf('function TaskForm'))

eq('titel ombrydes', row.includes('text-sm font-medium break-words'), true)
eq('ansvarlig ombrydes', row.includes('text-xs text-gray-500 break-words'), true)
eq('udfoert har et navn', row.includes('aria-label={isDone ?') && row.includes('Marker som udført'), true)
eq('ingen forfald bliver', row.includes('Ingen forfaldsdato'), true)
eq('slet bliver', row.includes('aria-label="Slet opgave"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-task-row-test OK')
process.exitCode = fail ? 1 : 0
