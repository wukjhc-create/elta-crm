/** Portal- og medarbejderchat viser koebenhavnsk tid. Afsendelse bliver. Koer: npx tsx scripts/chat-clock-test.ts */
import fs from 'fs'
import { copenhagenDateTimeLabel, copenhagenParts } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = '2026-01-15T23:30:00.000Z'
eq('sen aften er naeste dag', copenhagenParts(late).date, '2026-01-16')
eq('klokken er 00:30', copenhagenParts(late).clock, '00:30')
const label = copenhagenDateTimeLabel(late, 'short', false)
eq('uden aar starter paa 16', label.startsWith('16'), true)
eq('uden aar har klokken', label.includes('00.30') || label.includes('00:30'), true)

for (const file of [
  'src/components/modules/portal/portal-chat.tsx',
  'src/components/modules/customers/employee-chat.tsx',
]) {
  const src = fs.readFileSync(file, 'utf8')
  eq(`${file} sammenligner koebenhavnsk dato`, src.includes('copenhagenParts(dateStr).date === copenhagenParts(new Date()).date'), true)
  eq(`${file} i dag er klokken`, src.includes('return copenhagenParts(dateStr).clock'), true)
  eq(`${file} ellers er stempel`, src.includes("return copenhagenDateTimeLabel(dateStr, 'short', false)"), true)
  eq(`${file} ugyldig bliver`, src.includes('Number.isNaN(date.getTime())') && src.includes('return dateStr'), true)
  eq(`${file} ingen lokal datostreng`, src.includes('toDateString()'), false)
}

const portal = fs.readFileSync('src/components/modules/portal/portal-chat.tsx', 'utf8')
const staff = fs.readFileSync('src/components/modules/customers/employee-chat.tsx', 'utf8')
eq('portal sender stadig', portal.includes('sendPortalMessage'), true)
eq('medarbejder sender stadig', staff.includes('sendEmployeeMessage'), true)

console.log(fail ? `\n${fail} fejl` : '\nchat-clock-test OK')
process.exitCode = fail ? 1 : 0
