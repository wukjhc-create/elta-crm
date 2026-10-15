/** Rapportens realiserede DB og kostafvigelse siger naar de ikke kan beregnes. Kendte beloeb bliver. Koer: npx tsx scripts/report-profit-variance-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('db siger hvorfor', src.split("p.realized_db == null ? 'Kan ikke beregnes' :").length === 3, true)
eq('afvigelse siger hvorfor', src.split("formatCurrency(p.cost_deviation)}` : 'Kan ikke beregnes'").length === 3, true)
eq('kendt db bliver', src.includes('formatCurrency(p.realized_db)'), true)
eq('desktop-testid bliver', src.includes('data-testid="report-case-realized"') && src.includes('data-testid="report-case-deviation"'), true)
const mobile = src.slice(src.indexOf('data-testid="report-profit-mobile"'), src.indexOf('hidden md:block'))
eq('kortet har ikke desktop-testid', mobile.includes('report-case-realized'), false)

console.log(fail ? `\n${fail} fejl` : '\nreport-profit-variance-test OK')
process.exitCode = fail ? 1 : 0
