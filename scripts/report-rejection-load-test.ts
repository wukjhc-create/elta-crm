/** Afvisninger siger naar hentningen fejler. Tom tekst, beloeb og rate bliver. Koer: npx tsx scripts/report-rejection-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('afvisning siger fejl', src.includes('data-testid="report-rejection-load-error"') && src.includes('Det tælles ikke som ingen afvisninger.'), true)
eq('tom tekst bliver', src.includes('Når kunder afviser tilbud, vises årsagerne her.'), true)
eq('fejlen sendes med', src.includes('<RejectionAnalyticsSection stats={rejections} error={rejectionsError} />'), true)
eq('tabt omsaetning bliver', src.includes('formatCurrency(stats.lostRevenue)'), true)
eq('rate bliver', src.includes('stats.rejectionRate.toFixed(1)'), true)
eq('aarsag og beloeb bliver', src.includes('r.lostRevenue') && src.includes('formatCurrency(r.lostRevenue)'), true)

console.log(fail ? `\n${fail} fejl` : '\nreport-rejection-load-test OK')
process.exitCode = fail ? 1 : 0
