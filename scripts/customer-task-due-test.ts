/** Kundeopgavens forfald vises i koebenhavnsk dato. Opret bliver. Koer: npx tsx scripts/customer-task-due-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-tasks.tsx', 'utf8')
eq('forfald bruger koebenhavn', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen'"), true)
eq('manglende forfald bliver', src.includes('Ingen forfaldsdato'), true)
eq('opret sender stadig iso', src.includes('due_date: dueDate ? new Date(dueDate).toISOString() : null'), true)
eq('date-fns er vaek', src.includes("from 'date-fns'"), false)

const lateUtc = new Date('2026-01-15T23:30:00.000Z').toLocaleDateString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
eq('sen utc-aften er naeste dag i koebenhavn', lateUtc.includes('16'), true)
eq('utc-datoen staar ikke som dagen', lateUtc.startsWith('15'), false)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-task-due-test OK')
process.exitCode = fail ? 1 : 0
