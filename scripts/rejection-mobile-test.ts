/** Afvisninger ombrydes paa smaa skaerme. Koer: npx tsx scripts/rejection-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const reports = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
const dash = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
const reason = reports.slice(reports.indexOf('stats.byReason.map'), reports.indexOf('stats.trend.prev30Days'))

eq('aarsag og beloeb stables', reason.includes('flex-col') && reason.includes('r.lostRevenue') && reason.includes('r.label'), true)
eq('beloebet er ikke laast i en raekke', reason.includes('shrink-0'), false)
eq('dashboard-listen stables', dash.includes('Seneste afviste tilbud') && dash.slice(dash.indexOf('Seneste afviste tilbud'), dash.indexOf('recentRejections.map') + 400).includes('flex-col'), true)
eq('beloebet er stadig final_amount', dash.includes('formatCurrency(r.final_amount)'), true)

console.log(fail ? `\n${fail} fejl` : '\nrejection-mobile-test OK')
process.exitCode = fail ? 1 : 0
