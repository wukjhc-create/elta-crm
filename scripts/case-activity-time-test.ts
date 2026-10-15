/** Sagens aktivitetstid er københavnsk. Ugyldig dato og tom liste bliver. Kør: npx tsx scripts/case-activity-time-test.ts */
import fs from 'fs'
import { copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateTimeLabel('2026-01-15T23:30:00.000Z')
eq('sen aften er naeste dag', late.startsWith('16'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('15'), false)
eq('klokken er 00.30', late.includes('00.30') || late.includes('00:30'), true)

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-activity-tab.tsx', 'utf8')
eq('gyldig dato bruger hjaelperen', src.includes('return copenhagenDateTimeLabel(s)'), true)
eq('ugyldig dato bliver raa', src.includes('Number.isNaN(d.getTime())') && src.includes('return s'), true)
eq('listen kalder stadig funktionen', src.includes('fmtDateTime(e.created_at)'), true)
eq('tom liste bliver', src.includes('Ingen aktivitet endnu'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-activity-time-test OK')
process.exitCode = fail ? 1 : 0
