/** Lead til kunde opretter ikke naar laesningen fejler. Ikke-fundet bliver. Koer: npx tsx scripts/lead-convert-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/leads.ts', 'utf8')
const start = src.indexOf('export async function convertLeadToCustomerAction')
const end = src.indexOf('export async function getLeadAttachmentUrlAction')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('lead siger fejl foer ikke-fundet', fn.indexOf('if (leadErr)') < fn.indexOf("error: 'Lead ikke fundet'"), true)
eq('kobling siger fejl foer genbrug', fn.indexOf('if (existingErr)') < fn.indexOf('created: false'), true)
eq('laas siger fejl foer konflikt', fn.indexOf('if (claimErr)') < fn.indexOf('Leadet er netop ændret eller konverteres allerede'), true)
eq('dublet siger fejl foer opret', fn.indexOf('if (sameErr)') < fn.indexOf('insertCustomerWithRetry'), true)
eq('mail-krav bliver', fn.includes('Leadet mangler en e-mail — tilføj den før kunden oprettes'), true)
eq('navne-krav bliver', fn.includes('Leadet mangler firma- eller kontaktnavn'), true)
eq('konflikt bliver', fn.includes('Leadet er netop ændret eller konverteres allerede — genindlæs siden'), true)
eq('opret-tekst bliver', fn.includes("error: 'Kunne ikke oprette kunden'"), true)

const view = fs.readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
eq('fejlen vises', view.includes('toast.error(\'Fejl\', r.error'), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-convert-read-test OK')
process.exitCode = fail ? 1 : 0
