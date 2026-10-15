/** Sagsrentabilitet siger naar sagslisten fejler. Tom tekst og kosttal bliver. Koer: npx tsx scripts/report-cases-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/reports.ts', 'utf8')
const body = action.slice(action.indexOf('export async function getProjectProfitability'), action.indexOf('export async function getTeamProductivity'))
eq('sagsfejl siger det', body.includes("if (casesError) return { success: false, error: 'Kunne ikke hente sager' }"), true)
eq('tom liste bliver', body.includes('return { success: true, data: [] }'), true)
eq('kosttal bliver', body.includes('sumLabourCost(') && body.includes('profitabilityFigures('), true)
eq('vinduet bliver', body.includes('.limit(50)'), true)
eq('afviste timer bliver ude', body.includes(".neq('approval_status', 'rejected')"), true)

const view = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('panelet siger fejl', view.includes('data-testid="report-cases-load-error"') && view.includes('Det tælles ikke som ingen sager.'), true)
eq('tom tekst bliver', view.includes('Ingen sager i overblikket endnu. Opret en sag fra kunden, så den vises her.'), true)
eq('db siger stadig hvorfor', view.includes("p.realized_db == null ? 'Kan ikke beregnes'"), true)

console.log(fail ? `\n${fail} fejl` : '\nreport-cases-load-test OK')
process.exitCode = fail ? 1 : 0
