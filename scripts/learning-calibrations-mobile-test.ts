/** Komponentkalibreringen kan laeses paa mobil. Minutter og konfidens bliver. Koer: npx tsx scripts/learning-calibrations-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/learning/learning-client.tsx', 'utf8')
const start = src.indexOf('data-testid="learning-calibrations-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('kode ombrydes', mobile.includes('break-words">{cal.code}'), true)
eq('nuværende bliver', mobile.includes('{cal.current_time_minutes}'), true)
eq('foreslaaet bliver', mobile.includes('{cal.suggested_time_minutes}'), true)
eq('afvigelse bliver', mobile.includes('Math.abs(cal.variance_percentage).toFixed(1)'), true)
eq('datapunkter bliver', mobile.includes('{cal.sample_size}'), true)
eq('konfidens bliver', mobile.includes('(cal.confidence * 100).toFixed(0)'), true)
eq('anvend bliver', mobile.includes('handleApplyCalibration(cal)'), true)
eq('taerskel bliver', mobile.includes('cal.confidence < 0.3'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('tom liste bliver', src.includes('Ingen kalibreringsforslag tilgængelige. Der kræves mere projektdata.'), true)

console.log(fail ? `\n${fail} fejl` : '\nlearning-calibrations-mobile-test OK')
process.exitCode = fail ? 1 : 0
