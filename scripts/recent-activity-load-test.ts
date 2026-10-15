/** Seneste aktivitet siger naar hentningen fejler. Tom tekst og delvis liste bliver. Koer: npx tsx scripts/recent-activity-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/dashboard.ts', 'utf8')
const start = action.indexOf('export async function getRecentActivity')
const next = action.indexOf('export async function getPendingOffers')
const body = action.slice(start, next === -1 ? start + 4000 : next)
eq('fejl markeres', body.includes("error: failed ? 'Kunne ikke hente al aktivitet' : null"), true)
eq('lead beholdes ved data', body.includes('if (leadsResult.data)'), true)
eq('kunde beholdes ved data', body.includes('if (customersResult.data)'), true)
eq('tilbud beholdes ved data', body.includes('if (offersResult.data)'), true)
eq('sag beholdes ved data', body.includes('if (projectsResult.data)'), true)
eq('sags-link bliver', body.includes('link: `/dashboard/orders/${sag.id}`'), true)

const view = fs.readFileSync('src/components/modules/dashboard/recent-activity.tsx', 'utf8')
eq('tom fejl er ikke ingen aktivitet', view.includes('data-testid="recent-activity-load-error"') && view.includes('Det tælles ikke som ingen aktivitet.'), true)
eq('delvis liste siges ufuldstaendig', view.includes('Listen er ufuldstændig.'), true)
eq('tom succes bliver', view.includes('Ingen aktivitet endnu'), true)
eq('naeste skridt bliver', view.includes('Leads, kunder, tilbud og sager vises her, når de oprettes.'), true)
eq('handling ombrydes', view.includes('text-sm font-medium break-words">{activity.action}'), true)

const page = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
eq('dashboardet sender listen', page.includes('activities={recentActivityResult.activities}'), true)
eq('dashboardet sender fejlen', page.includes('loadError={recentActivityResult.error}'), true)

console.log(fail ? `\n${fail} fejl` : '\nrecent-activity-load-test OK')
process.exitCode = fail ? 1 : 0
