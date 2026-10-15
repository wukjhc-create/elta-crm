/** Lead-aktivitet siger naar hentningen fejler. En aekte tom log bliver. Koer: npx tsx scripts/lead-activity-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/leads.ts', 'utf8')
const start = action.indexOf('export async function getLeadActivities')
const next = action.indexOf('export async function addLeadActivity')
const body = action.slice(start, next)
eq('aktivitet findes', body.length > 80, true)
eq('query-fejl kaster', body.includes("throw new Error('DATABASE_ERROR')"), true)
eq('fejlen er ikke tom liste', body.includes("formatError(err, 'Kunne ikke hente aktiviteter')"), true)
eq('laeseret bliver', body.includes("error: 'Manglende tilladelse: leads.view'"), true)

const page = fs.readFileSync('src/app/dashboard/leads/[id]/page.tsx', 'utf8')
eq('siden tjekker success', page.includes('activitiesResult.success ? activitiesResult.data || [] : []'), true)
eq('siden sender fejlen', page.includes("activitiesResult.success ? null : activitiesResult.error || 'Kunne ikke hente aktiviteter'"), true)
eq('blind tom liste er vaek', page.includes('activities={activitiesResult.data || []}'), false)

const view = fs.readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
eq('banneret findes', view.includes('data-testid="lead-activities-load-error"') && view.includes('Det tælles ikke som ingen aktiviteter.'), true)
eq('tom tekst kraever ingen fejl', view.includes('!activitiesError && activities.length === 0'), true)
eq('aegte tom bliver', view.includes('Ingen aktiviteter endnu'), true)
eq('raekker vises stadig', view.includes('activities.length > 0'), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-activity-load-test OK')
process.exitCode = fail ? 1 : 0
