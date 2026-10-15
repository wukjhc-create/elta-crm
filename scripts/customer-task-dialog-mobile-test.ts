/** Kundeopgave-dialogen kan rulles. Opret og forfald bliver. Koer: npx tsx scripts/customer-task-dialog-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-tasks.tsx', 'utf8')
eq('panelet kan rulles', src.includes('w-full max-w-md max-h-[90vh] overflow-y-auto p-6'), true)
eq('titel ombrydes', src.includes('text-lg font-semibold break-words min-w-0'), true)
eq('luk har et navn', src.includes('aria-label="Luk"'), true)
eq('felter stables', src.includes('grid-cols-1 sm:grid-cols-2 gap-4'), true)
eq('opret bliver', src.includes("'Opret'"), true)
eq('opdater bliver', src.includes("'Opdater'"), true)
eq('forfald sender stadig iso', src.includes('due_date: dueDate ? new Date(dueDate).toISOString() : null'), true)
eq('opret sender stadig iso', src.includes('due_date: dueDate ? new Date(dueDate).toISOString() : undefined'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-task-dialog-mobile-test OK')
process.exitCode = fail ? 1 : 0
