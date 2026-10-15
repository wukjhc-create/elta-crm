/** En fejlet laesning kobler ikke leadet og er ikke "ikke fundet". Et aegte tomt opslag bliver. Koer: npx tsx scripts/lead-link-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/actions/lead-duplicates.ts', 'utf8')
const start = src.indexOf('export async function linkLeadToCustomerAction')
const fn = src.slice(start)
eq('funktion findes', start > 0, true)
eq('laesefejl foer ikke-fundet', fn.indexOf("error: 'Kunne ikke hente lead eller kunde'") < fn.indexOf("error: 'Lead ikke fundet'"), true)
eq('laesefejl foer kunde', fn.indexOf("error: 'Kunne ikke hente lead eller kunde'") < fn.indexOf("error: 'Kunde ikke fundet'"), true)
eq('laesefejl foer skrivning', fn.indexOf("error: 'Kunne ikke hente lead eller kunde'") < fn.indexOf('.update('), true)
eq('lead ikke fundet bliver', fn.includes("error: 'Lead ikke fundet'"), true)
eq('kunde ikke fundet bliver', fn.includes("error: 'Kunde ikke fundet'"), true)
eq('koblingsfejl bliver', fn.includes("error: 'Kunne ikke koble leadet'"), true)
eq('update-krop bliver', fn.includes('custom_fields: { ...cf, customer_id: customerId }'), true)
eq('tilladelse bliver', fn.includes("error: 'Manglende tilladelse: leads.edit'"), true)

const view = fs.readFileSync('src/app/dashboard/leads/[id]/lead-customer-candidates.tsx', 'utf8')
eq('fejlen vises', view.includes('data-testid="lead-link-error"') && view.includes('setError(r.error'), true)
eq('koblingskald bliver', view.includes('linkLeadToCustomerAction(leadId, c.id)'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nlead-link-read-test OK')
process.exitCode = fail ? 1 : 0
