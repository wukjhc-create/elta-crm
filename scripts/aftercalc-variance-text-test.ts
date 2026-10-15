/** Manglende DB-afvigelse siger at den ikke kan beregnes. Tallene bliver. Kør: npx tsx scripts/aftercalc-variance-text-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const fn = src.slice(src.indexOf('function varianceText'), src.indexOf('export function AftercalcOverviewClient'))
eq('mangler siger hvorfor', fn.includes("if (amount == null) return 'Kan ikke beregnes'"), true)
eq('kendt beloeb bliver', fn.includes('return `${sign}${kr(amount)}${pointsText}`'), true)
eq('kortet bruger teksten', src.includes('DB-afvigelse: {varianceText(r.db_variance, r.db_variance_pct_points)}'), true)
eq('tabellen bruger teksten', src.includes('{varianceText(r.db_variance, r.db_variance_pct_points)}'), true)
eq('vinduet er ikke udvidet', src.includes('AFTERCALC_CASE_WINDOW') || src.includes('.limit(201)'), false)
eq('oversigten hentes stadig', src.includes('getAftercalcOverview'), true)

console.log(fail ? `\n${fail} fejl` : '\naftercalc-variance-text-test OK')
process.exitCode = fail ? 1 : 0
