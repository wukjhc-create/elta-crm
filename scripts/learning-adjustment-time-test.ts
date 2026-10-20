/** Læringsloggens dato er københavnsk, og rækken ombrydes. Værdierne bliver. Kør: npx tsx scripts/learning-adjustment-time-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const label = new Date('2026-01-15T23:30:00.000Z').toLocaleDateString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  day: 'numeric',
  month: 'short',
})
eq('sen aften er den 16', label.startsWith('16'), true)
eq('sen aften er januar', label.toLowerCase().includes('jan'), true)
eq('sen aften er ikke utc-dagen', label.startsWith('15'), false)

const src = fs.readFileSync('src/app/dashboard/settings/learning/learning-client.tsx', 'utf8')
eq('datoen er koebenhavn', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short' })"), true)
eq('raekken ombrydes', src.includes('flex flex-wrap items-start gap-3 p-3 border rounded-lg'), true)
eq('gamle vaerdi bliver', src.includes('{adj.old_value}'), true)
eq('nye vaerdi bliver', src.includes('{adj.new_value}'), true)
eq('konfidens bliver', src.includes('cal.confidence < 0.3'), true)

console.log(fail ? `\n${fail} fejl` : '\nlearning-adjustment-time-test OK')
process.exitCode = fail ? 1 : 0
