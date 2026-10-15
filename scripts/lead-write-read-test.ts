/** Lead-aendring og sletning sker ikke naar leadet ikke kan laeses. Koer: npx tsx scripts/lead-write-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/leads.ts', 'utf8')
const update = action.slice(action.indexOf('export async function updateLead'), action.indexOf('export async function deleteLead'))
const del = action.slice(action.indexOf('export async function deleteLead'), action.indexOf('export async function updateLeadStatus'))

eq('aendring findes', update.length > 80, true)
eq('aendring laeser foer skriv', update.indexOf('if (oldErr)') < update.indexOf('.update('), true)
eq('aendring skriver ikke', update.includes('Det er ikke ændret.'), true)
eq('statusregel bliver', update.includes('isValidLeadTransition(oldLead.status as LeadStatus, newStatus)'), true)
eq('redigeringsret bliver', update.includes("error: 'Manglende tilladelse: leads.edit'"), true)

eq('sletning findes', del.length > 80, true)
eq('sletning laeser foer slet', del.indexOf('if (leadErr)') < del.indexOf('.delete('), true)
eq('sletning sletter ikke', del.includes('Det er ikke slettet.'), true)
eq('ukendt navn bliver', del.includes("lead?.company_name || 'Ukendt'"), true)
eq('fremmed noegle bliver', del.includes("error: 'Lead kan ikke slettes da det har tilknyttede data'"), true)
eq('sletteret bliver', del.includes("error: 'Manglende tilladelse: leads.delete'"), true)

const form = fs.readFileSync('src/components/modules/leads/lead-form.tsx', 'utf8')
eq('formularen viser fejlen', form.includes("setError(result.error || 'Der opstod en fejl')"), true)
const detail = fs.readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
eq('detaljen viser slettefejlen', detail.includes("toast.error('Kunne ikke slette lead', result.error)"), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-write-read-test OK')
process.exitCode = fail ? 1 : 0
