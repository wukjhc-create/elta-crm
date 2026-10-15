/** Sagsfakturaens historiktid er københavnsk. Beløb bliver. Kør: npx tsx scripts/case-invoice-history-time-test.ts */
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

const src = fs.readFileSync('src/components/modules/orders/case-invoice-history.tsx', 'utf8')
eq('tiden bruger hjaelperen', src.includes('return copenhagenDateTimeLabel(s)'), true)
eq('listen viser tiden', src.includes('fmtDateTime(e.created_at)'), true)
eq('raekken kan ombrydes', src.includes('flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5'), true)
eq('beloeb bliver', src.includes("formatCurrency(e.amount_incl_vat, 'DKK', 2)"), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-invoice-history-time-test OK')
process.exitCode = fail ? 1 : 0
