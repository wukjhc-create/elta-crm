/** En fejlet lead-dubletsoegning er ikke ingen match. Et aegte tomt resultat bliver. Koer: npx tsx scripts/lead-candidates-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/actions/lead-duplicates.ts', 'utf8')
const start = src.indexOf('export async function getLeadCustomerCandidatesAction')
const end = src.indexOf('export async function linkLeadToCustomerAction')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('lead-fejl foer ikke-fundet', fn.indexOf("error: 'Kunne ikke hente lead'") < fn.indexOf("error: 'Lead ikke fundet'"), true)
eq('ikke-fundet bliver', fn.includes("error: 'Lead ikke fundet'"), true)
eq('sidefejl er ikke tom liste', fn.includes("if (pageErr) return { success: false, error: 'Kunne ikke finde mulige kunder' }"), true)
eq('sidefejl foer listen', fn.indexOf('if (pageErr)') < fn.indexOf('data.push'), true)
eq('navnefejl er ikke tom liste', fn.includes("if (nameErr) return { success: false, error: 'Kunne ikke finde mulige kunder' }"), true)
eq('navnefejl foer match', fn.indexOf('if (nameErr)') < fn.indexOf("reason: 'name'"), true)
eq('telefonmatch bliver', fn.includes('last8(c.phone) === phone || last8(c.mobile) === phone'), true)
eq('navnematch bliver', fn.includes('company_name.ilike.') && fn.includes('contact_person.ilike.'), true)
eq('mailfilter bliver', fn.includes("(c.email ?? '').toLowerCase() !== leadEmail"), true)
eq('fem bliver', fn.includes('.slice(0, 5)'), true)
eq('tilladelse bliver', fn.includes("error: 'Manglende tilladelse'"), true)
eq('allerede koblet bliver tom', fn.includes('return { success: true, data: [] }'), true)

const view = fs.readFileSync('src/app/dashboard/leads/[id]/lead-customer-candidates.tsx', 'utf8')
const banner = 'Mulige kunder kunne ikke hentes. Det tælles ikke som ingen match.'
eq('banneret siger det', view.includes('data-testid="lead-candidates-load-error"') && view.includes(banner), true)
eq('succes saetter listen', view.includes('if (r.success) setItems(r.data ?? [])'), true)
eq('fejl saetter ikke forslag', view.indexOf('else setLoadError') > view.indexOf('if (r.success) setItems'), true)
eq('kast viser fejl', view.includes('setLoadError(\'' + banner + '\')'), true)
eq('aegte tom skjules', view.includes('if (!items.length) return null'), true)
eq('kobling bliver', view.includes('linkLeadToCustomerAction(leadId, c.id)'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nlead-candidates-load-test OK')
process.exitCode = fail ? 1 : 0
