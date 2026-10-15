/** Job uden tid siger naar sag eller montor ikke kan hentes. Tom liste og dato bliver. Koer: npx tsx scripts/jobs-without-time-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/planning-backlog.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function getJobsWithoutTimeAction'), src.indexOf('export async function getWorkOrdersWithoutTimeAction'))
eq('navnefejl siger det', fn.includes('if (caseResult.error || empResult.error)') && fn.includes("return { success: false, error: 'Kunne ikke hente job uden tid' }"), true)
eq('tom liste bliver', fn.includes('return { success: true, data: { items: [], total: 0 } }'), true)
eq('dansk dag bliver', fn.includes('copenhagenParts(new Date()).date'), true)
eq('vinduet bliver', fn.includes('60 * 86_400_000'), true)

const page = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
eq('kalenderen siger fejl', page.includes('Det tælles ikke som at tiden er registreret.'), true)

console.log(fail ? `\n${fail} fejl` : '\njobs-without-time-load-test OK')
process.exitCode = fail ? 1 : 0
