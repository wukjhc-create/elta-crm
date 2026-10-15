/** Tilbudsaktivitetens klokkeslæt er københavnsk. Den tomme tekst bliver. Kør: npx tsx scripts/offer-activity-time-test.ts */
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
eq('aaret er udeladt', late.includes('2026'), false)

const src = fs.readFileSync('src/components/modules/offers/offer-activity-timeline.tsx', 'utf8')
eq('tiden bruger hjaelperen', src.includes("copenhagenDateTimeLabel(activity.created_at, 'short', false)"), true)
eq('raekken kan ombrydes', src.includes('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5'), true)
eq('tom liste bliver', src.includes('når tilbuddet sendes, ændres eller accepteres'), true)
eq('date-fns er vaek', src.includes("from 'date-fns'"), false)

console.log(fail ? `\n${fail} fejl` : '\noffer-activity-time-test OK')
process.exitCode = fail ? 1 : 0
