/** Opgave-badge siger naar hentningen fejler. Tal og montor-scope bliver. Koer: npx tsx scripts/task-count-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const start = action.indexOf('export async function getTaskCounts')
const next = action.indexOf('export async function getMyPendingReminders')
const body = action.slice(start, next === -1 ? start + 2500 : next)
eq('auth-fejl er ikke 0', body.includes("error: 'Kunne ikke hente opgavetal'"), true)
eq('query-fejl er ikke 0', body.split("error: 'Kunne ikke hente opgavetal'").length >= 3, true)
eq('rigtigt nul har error null', body.includes('error: null'), true)
eq('head-taelling bliver', body.includes("select('*', { count: 'exact', head: true })"), true)
eq('montor-scope bliver', body.includes("if (role === 'montør')") && body.includes(".eq('assigned_to', userId)"), true)
eq('aabne er ikke done', body.includes(".neq('status', 'done')"), true)

const view = fs.readFileSync('src/components/layout/sidebar.tsx', 'utf8')
eq('badge siger fejl', view.includes('data-testid="task-count-load-error"') && view.includes('Det tælles ikke som 0.'), true)
eq('fejl nulstiller ikke et tidligere tal', view.indexOf('if (error)') < view.indexOf('setTaskCount(active)'), true)
eq('tal vises naar hentningen lykkes', view.includes('!countError && (taskCount > 0 || overdueCount > 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\ntask-count-load-test OK')
process.exitCode = fail ? 1 : 0
