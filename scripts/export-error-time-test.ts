/** Eksportfejl-mailens tid er københavnsk. Afsendelsen aktiveres ikke her. Kør: npx tsx scripts/export-error-time-test.ts */
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

const src = fs.readFileSync('src/lib/services/export-error-notification.ts', 'utf8')
eq('tiden bruger hjaelperen', src.includes('return copenhagenDateTimeLabel(s)'), true)
eq('afsender bliver', src.includes("const FROM_MAILBOX = 'kontakt@eltasolar.dk'"), true)
eq('beslutningen bliver', src.includes('decideErrorNotification'), true)
eq('funktionen bliver', src.includes('export async function sendExportErrorNotification'), true)

console.log(fail ? `\n${fail} fejl` : '\nexport-error-time-test OK')
process.exitCode = fail ? 1 : 0
