/** Påmindelsesoverlayets klokkeslæt er københavnsk tid. Kør: npx tsx scripts/reminder-stamp-time-test.ts */
import fs from 'fs'
import { copenhagenDateTimeLabel } from '../src/lib/utils/copenhagen-time'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const late = copenhagenDateTimeLabel('2026-01-15T23:30:00.000Z', 'short', false)
eq('sen aften er naeste dag', late.startsWith('16'), true)
eq('sen aften er ikke utc-dagen', late.startsWith('15'), false)
eq('klokken er 00.30', late.includes('00.30') || late.includes('00:30'), true)
eq('aaret er udeladt i overlayet', late.includes('2026'), false)
eq('fuld etiket har aar', copenhagenDateTimeLabel('2026-01-15T23:30:00.000Z').includes('2026'), true)

const src = fs.readFileSync('src/components/layout/task-reminder-overlay.tsx', 'utf8')
eq('prisadvarsel bruger hjaelperen', src.includes("copenhagenDateTimeLabel(alert.created_at, 'short', false)"), true)
eq('forfald bruger hjaelperen', src.includes("copenhagenDateTimeLabel(reminder.due_date, 'short', false)"), true)
eq('uden dato bliver', src.includes("'Ingen dato'"), true)
eq('luk har et navn', src.includes('aria-label="Luk påmindelse"'), true)
eq('prisadvarsel kan lukkes', src.includes('aria-label="Luk prisadvarsel"'), true)
eq('raekken kan ombrydes', src.includes('flex flex-wrap items-center gap-2 mt-1.5'), true)
eq('date-fns er vaek', src.includes("from 'date-fns'"), false)

console.log(fail ? `\n${fail} fejl` : '\nreminder-stamp-time-test OK')
process.exitCode = fail ? 1 : 0
