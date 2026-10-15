/** Fakturaøkonomiens hændelsestid er københavnsk. Beløb og forfaldsdato bliver. Kør: npx tsx scripts/invoice-economy-time-test.ts */
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

const src = fs.readFileSync('src/components/modules/dashboard/invoice-economy-section.tsx', 'utf8')
eq('haendelse bruger hjaelperen', src.includes("copenhagenDateTimeLabel(s, 'short', false)"), true)
eq('listen viser tiden', src.includes('fmtDateTime(e.created_at)'), true)
eq('forfaldsdato bliver middag', src.includes("s.length === 10 ? s + 'T12:00:00' : s"), true)
eq('beloeb inkl moms bliver', src.includes('kr(e.amount_incl_vat)'), true)
eq('tom forfald bliver', src.includes('Der er ingen forfaldne fakturaer lige nu.'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-economy-time-test OK')
process.exitCode = fail ? 1 : 0
