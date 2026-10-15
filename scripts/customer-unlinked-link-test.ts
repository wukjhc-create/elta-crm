/** Kobling siger fejl naar opdateringen fejler. Opret kunde og et aegte 0 bliver. Koer: npx tsx scripts/customer-unlinked-link-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const link = fs.readFileSync('src/lib/mail/retro-link.ts', 'utf8')
const fn = link.slice(link.indexOf('export async function linkUnlinkedEmailsFromAddress'))
eq('funktion findes', fn.includes('link_status: \'linked\''), true)
eq('ikke-mail er 0', fn.includes("if (!email || !email.includes('@') || !retroLinkable(email)) return 0"), true)
eq('fejl er null', fn.includes('return null'), true)
eq('fejl foer laengde', fn.indexOf('return null') < fn.indexOf('return (data ?? []).length'), true)
eq('aegte nul bliver', fn.includes('return (data ?? []).length'), true)
eq('skriver stadig', fn.includes("linked_by: 'retro'"), true)

const action = fs.readFileSync('src/lib/actions/customer-mailbox.ts', 'utf8')
const act = action.slice(action.indexOf('export async function linkUnlinkedCustomerEmailsAction'))
eq('laesefejl', act.includes("error: 'Kunne ikke læse kundens mail. Det tælles ikke som ingen adresse.'"), true)
eq('ingen adresse bliver', act.includes("error: 'Kunden har ingen mailadresse'"), true)
eq('opdateringsfejl', act.includes("error: 'Kunne ikke koble mails. Det tælles ikke som 0.'"), true)
eq('fejl foer succes', act.indexOf('if (linked == null)') < act.indexOf('return { success: true, linked }'), true)
eq('uden ret bliver', act.includes("if (denied) return { success: false, error: denied }"), true)

const customers = fs.readFileSync('src/lib/actions/customers.ts', 'utf8')
eq('opret kobler stadig', customers.includes('await linkUnlinkedEmailsFromAddress(supabase, customer.id, customer.email)'), true)
eq('opret fejler ikke paa kobling', customers.includes('Kunne ikke koble mails'), false)

const view = fs.readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')
eq('fejltoast bliver', view.includes("toast.error('Kunne ikke koble mails', r.error)"), true)
eq('succes viser tal', view.includes('mail(s) koblet til kunden'), true)
eq('afsendelse bliver', view.includes('sendEmailToCustomer'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-unlinked-link-test OK')
process.exitCode = fail ? 1 : 0
