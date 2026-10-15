/** Betalingsrapportens tidspunkt er københavnsk. Ugedag og send bliver. Kør: npx tsx scripts/payment-report-time-test.ts */
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

const src = fs.readFileSync('src/app/dashboard/settings/invoice-email/payment-report-settings.tsx', 'utf8')
eq('tidspunkt bruger hjaelperen', src.includes('return copenhagenDateTimeLabel(s)'), true)
eq('tom tid bliver', src.includes("if (!s) return '—'"), true)
eq('ugedag bliver', src.includes("weekday: 'long'"), true)
eq('test bliver', src.includes('Send testrapport'), true)
eq('ingen truncate', src.includes('truncate'), false)

console.log(fail ? `\n${fail} fejl` : '\npayment-report-time-test OK')
process.exitCode = fail ? 1 : 0
