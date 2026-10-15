/** Omsaetning og noegletal siger naar hentningen fejler. Belob og soejler bliver. Koer: npx tsx scripts/report-revenue-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('omsaetning siger fejl', src.includes('data-testid="report-revenue-load-error"') && src.includes('Det tælles ikke som 0 kr.'), true)
eq('noegletal siger fejl', src.includes('data-testid="report-summary-load-error"') && src.includes('Kunne ikke hente nøgletal. Det tælles ikke som 0 kr.'), true)
eq('grafen faar fejlen', src.includes('<RevenueChart data={revenue} error={revenueError} />'), true)
eq('soejlehoejden bliver', src.includes('(d.accepted_revenue / maxValue) * 100'), true)
eq('belobet bliver', src.includes('formatCurrency(d.accepted_revenue)'), true)
eq('kpi-omsaetning bliver', src.includes('formatCurrency(summary.total_revenue)'), true)
eq('accept-rate bliver', src.includes('summary.acceptance_rate.toFixed(0)'), true)
eq('forklaringen bliver', src.includes('Accepteret omsætning'), true)

console.log(fail ? `\n${fail} fejl` : '\nreport-revenue-load-test OK')
process.exitCode = fail ? 1 : 0
