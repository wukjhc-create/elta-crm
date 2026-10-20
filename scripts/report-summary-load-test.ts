/** Rapportens noegletal siger naar en delforespoergsel fejler. Formlen bliver. Koer: npx tsx scripts/report-summary-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/reports.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function getReportsSummary'), src.indexOf('export async function getRevenueByPeriod'))
const guard = "return { success: false, error: 'Kunne ikke hente nøgletal' }"
eq('fejl foer formel', fn.includes(guard) && fn.indexOf(guard) < fn.indexOf('const acceptance_rate'), true)
eq('accepterede tilbud', fn.includes('acceptedOffersResult.error'), true)
eq('afventende tilbud', fn.includes('pendingOffersResult.error'), true)
eq('accepteret antal', fn.includes('acceptedCountResult.error'), true)
eq('afvist antal', fn.includes('rejectedCountResult.error'), true)
eq('alle tilbud', fn.includes('allOffersResult.error'), true)
eq('aktive projekter', fn.includes('activeProjectsResult.error'), true)
eq('timer', fn.includes('monthEntriesResult.error'), true)
eq('topkunde', fn.includes('topCustomerResult.error'), true)
eq('formel bliver', fn.includes('const acceptance_rate = decided > 0 ? ((acceptedCountResult.count || 0) / decided) * 100 : 0'), true)
eq('projektantal bliver', fn.includes('active_projects: activeProjectsResult.count || 0'), true)
eq('ekskl moms bliver', fn.includes('sum + exVat(o)'), true)
eq('tilladelse bliver', fn.includes('Manglende tilladelse: economy.view'), true)
eq('afviste timer bliver', fn.includes(".neq('approval_status', 'rejected')"), true)
eq('dansk maaned bliver', fn.includes('copenhagenParts(new Date()).date.slice(0, 7)'), true)

const view = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('kortet siger fejl', view.includes('data-testid="report-summary-load-error"') && view.includes('Kunne ikke hente nøgletal. Det tælles ikke som 0 kr.'), true)
eq('succes viser stadig beloeb', view.includes('formatCurrency(summary.total_revenue)'), true)
eq('succes viser stadig rate', view.includes('summary.acceptance_rate.toFixed(0)'), true)

console.log(fail ? `\n${fail} fejl` : '\nreport-summary-load-test OK')
process.exitCode = fail ? 1 : 0
