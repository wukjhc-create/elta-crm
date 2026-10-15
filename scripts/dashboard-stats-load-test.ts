/** Dashboard-noegletal siger naar hentningen fejler. Tomme tekster og formler bliver. Koer: npx tsx scripts/dashboard-stats-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/dashboard.ts', 'utf8')
const start = action.indexOf('export async function getDashboardStats')
const next = action.indexOf('export async function getRecentActivity')
const body = action.slice(start, next === -1 ? start + 8000 : next)
eq('leads fejler ikke stille', body.includes('rowsOrFail<{ status: string }>'), true)
eq('kunder fejler ikke stille', body.includes('rowsOrFail<{ is_active: boolean; created_at: string }>'), true)
eq('tilbud fejler ikke stille', body.includes('rowsOrFail<{ status: string; final_amount: number | null; tax_amount: number | null }>'), true)
eq('timer fejler ikke stille', body.includes('rowsOrFail<{ hours: number | string | null; billable: boolean | null }>'), true)
eq('sagsfejl taelles', body.includes('const casesFailed = !!projectsResult.error'), true)
eq('mailfejl taelles', body.includes('const emailsFailed = !!customerEmailsResult.error'), true)
eq('beskedfejl taelles', body.includes('const messagesFailed = !!messagesResult.error'), true)
eq('afviste timer bliver ude', body.includes(".neq('approval_status', 'rejected')"), true)
eq('dansk maaned bliver', body.includes('copenhagenParts(new Date()).date.slice(0, 7)'), true)
eq('ekskl moms bliver', action.includes('return Number(o.final_amount ?? 0) - Number(o.tax_amount ?? 0)'), true)
eq('maanedsgrafen vaelter ikke', action.includes('function allRows'), true)

const page = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
eq('leads er ikke nul', page.includes("stats.loadErrors.leads ? '—' : (stats.leads.total - stats.leads.won - stats.leads.lost)"), true)
eq('leads siger fejl', page.includes('Kunne ikke hente leads. Det tælles ikke som 0.'), true)
eq('tomme leads bliver', page.includes("stats.leads.total === 0 ? 'Ingen leads endnu'"), true)
eq('kunder siger fejl', page.includes('Kunne ikke hente kunder. Det tælles ikke som 0.'), true)
eq('tomme kunder bliver', page.includes("'Ingen kunder endnu'"), true)
eq('tilbud siger fejl', page.includes('Kunne ikke hente tilbud. Det tælles ikke som 0.'), true)
eq('tomme tilbud bliver', page.includes('Ingen tilbud afventer svar'), true)
eq('sager siger fejl', page.includes('Kunne ikke hente sager. Det tælles ikke som 0.'), true)
eq('tomme sager bliver', page.includes('Ingen aktive sager'), true)
eq('timer siger fejl', page.includes('Kunne ikke hente timer. Det tælles ikke som 0.'), true)
eq('mails siger fejl', page.includes('Kunne ikke hente mails. Det tælles ikke som 0.'), true)
eq('beskeder siger fejl', page.includes('Kunne ikke hente beskeder. Det tælles ikke som 0.'), true)

const pipe = fs.readFileSync('src/components/modules/dashboard/leads-pipeline.tsx', 'utf8')
eq('pipeline siger fejl', pipe.includes('data-testid="leads-pipeline-load-error"') && pipe.includes('Det tælles ikke som 0.'), true)
eq('pipeline-raten bliver', page.includes('conversionRate={stats.leads.conversionRate}'), true)

console.log(fail ? `\n${fail} fejl` : '\ndashboard-stats-load-test OK')
process.exitCode = fail ? 1 : 0
