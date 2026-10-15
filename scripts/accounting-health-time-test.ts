/** Regnskabswidgetens fejl-tid er københavnsk. Tællerne bliver. Kør: npx tsx scripts/accounting-health-time-test.ts */
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

const src = fs.readFileSync('src/components/modules/dashboard/accounting-health-widget.tsx', 'utf8')
eq('tiden bruger hjaelperen', src.includes("copenhagenDateTimeLabel(s, 'short', false)"), true)
eq('fejlen viser tiden', src.includes('fmtDateTime(data.latest_error.at)'), true)
eq('fejlen kan ombrydes', src.includes('text-red-700 mt-0.5 break-words'), true)
eq('taelleren bliver', src.includes('data.not_exported_count'), true)
eq('eksporttallet bliver', src.includes('data.exported_7d'), true)

console.log(fail ? `\n${fail} fejl` : '\naccounting-health-time-test OK')
process.exitCode = fail ? 1 : 0
