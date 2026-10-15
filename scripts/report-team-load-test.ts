/** Team-produktivitet siger naar timerne ikke kan hentes. Tom liste, maaned og afviste timer bliver. Koer: npx tsx scripts/report-team-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/reports.ts', 'utf8')
const start = action.indexOf('export async function getTeamProductivity')
const fn = action.slice(start, action.indexOf('export async function', start + 20))
eq('funktionen findes', start > 0 && fn.includes('getTeamProductivity'), true)
eq('fejl er ikke en tom liste', fn.includes("return { success: false, error: 'Kunne ikke hente teamets timer' }") && !fn.includes('.catch(() => []'), true)
eq('maaned bliver', fn.includes('since.setMonth(since.getMonth() - months)'), true)
eq('afviste timer bliver ude', fn.includes(".neq('approval_status', 'rejected')"), true)
eq('timer taelles som foer', fn.includes('const h = Number(l.hours ?? 0) || 0'), true)
eq('rigtig tom liste bliver', fn.includes('if (!logs || logs.length === 0)') && fn.includes('return { success: true, data: [] }'), true)

const page = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('tabellen siger fejl', page.includes('data-testid="report-team-load-error"') && page.includes('Det tælles ikke som ingen tidsregistreringer.'), true)
eq('tom liste bliver', page.includes('Ingen tidsregistreringer endnu') && page.includes('Registrér tiden på sagen under Planlægning.'), true)
eq('fejlen sendes med', page.includes('<TeamTable data={team} error={teamError} />'), true)
eq('kaldet bliver en maaned', page.includes('getTeamProductivity(1)'), true)
eq('tragten bliver', page.includes('setFunnelError(false)') && page.includes('setFunnelError(true)'), true)

console.log(fail ? `\n${fail} fejl` : '\nreport-team-load-test OK')
process.exitCode = fail ? 1 : 0
