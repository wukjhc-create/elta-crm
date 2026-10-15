/** Medarbejderens oprettet-tid er københavnsk. Ansættelsesdatoen bliver. Kør: npx tsx scripts/employee-created-time-test.ts */
import fs from 'fs'
import { copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateTimeLabel('2026-01-31T23:30:00.000Z')
eq('sen aften er naeste dag', late.startsWith('1'), true)
eq('sen aften er februar', late.toLowerCase().includes('feb'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('31'), false)

const src = fs.readFileSync('src/app/dashboard/employees/[id]/employee-detail-client.tsx', 'utf8')
eq('oprettet bruger hjaelperen', src.includes('return copenhagenDateTimeLabel(s)'), true)
eq('oprettet vises', src.includes('fmtDateLong(employee.created_at)'), true)
eq('ansat bliver dato', src.includes('fmtDate(employee.hire_date)') && src.includes('s.slice(0, 10)'), true)
eq('fratraadt bliver dato', src.includes('fmtDate(employee.termination_date)'), true)
eq('ingen lokal intl-dato', src.includes("toLocaleString('da-DK'"), false)

console.log(fail ? `\n${fail} fejl` : '\nemployee-created-time-test OK')
process.exitCode = fail ? 1 : 0
