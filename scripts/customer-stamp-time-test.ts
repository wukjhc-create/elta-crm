/** Kundens tidsstempler vises i københavnsk tid. Kør: npx tsx scripts/customer-stamp-time-test.ts */
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

const winter = copenhagenDateTimeLabel('2026-11-30T23:30:00.000Z')
eq('vinterskift er naeste dag', winter.startsWith('1'), true)
eq('vinterskift viser 00.30', winter.includes('00.30') || winter.includes('00:30'), true)

const src = fs.readFileSync('src/app/dashboard/customers/[id]/customer-detail-client.tsx', 'utf8')
const block = src.slice(src.indexOf('Tidsstempler'), src.indexOf('Tidsstempler') + 900)
eq('oprettet bruger hjaelperen', block.includes('copenhagenDateTimeLabel(customer.created_at)'), true)
eq('opdateret bruger hjaelperen', block.includes('copenhagenDateTimeLabel(customer.updated_at)'), true)
eq('raekken kan ombrydes', block.includes('flex flex-wrap items-baseline justify-between'), true)
eq('date-fns er vaek fra kortet', block.includes("from 'date-fns'"), false)
eq('pladsholder-mailen bliver', src.includes('data-testid="customer-email-missing"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-stamp-time-test OK')
process.exitCode = fail ? 1 : 0
