/** Kundekortet siger naar tidligere mails ikke kan taelles. Kobling, pladsholder og et aegte 0 bliver. Koer: npx tsx scripts/customer-unlinked-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const link = fs.readFileSync('src/lib/mail/retro-link.ts', 'utf8')
const count = link.slice(link.indexOf('export async function countUnlinkedEmailsFromAddress'), link.indexOf('export async function linkUnlinkedEmailsFromAddress'))
eq('taeller findes', count.length > 80, true)
eq('uden mail er 0', count.includes("if (!email || !email.includes('@') || !retroLinkable(email)) return 0"), true)
eq('fejl er null', count.includes('if (error)'), true)
eq('fejl returnerer null', count.includes('return null'), true)
eq('aekte nul', count.includes('return count ?? 0'), true)
eq('fejl foer nul', count.indexOf('if (error)') < count.indexOf('return count ?? 0'), true)
eq('pladsholder bliver', link.includes("e.endsWith('@elta-crm.local')"), true)
eq('formular bliver', link.includes('formsubmit'), true)
eq('kobling skriver stadig', link.includes("link_status: 'linked'"), true)

const action = fs.readFileSync('src/lib/actions/customer-mailbox.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getUnlinkedCustomerEmailCountAction'), action.indexOf('export async function linkUnlinkedCustomerEmailsAction'))
eq('action findes', fn.length > 80, true)
eq('uden ret er 0', fn.includes("if (await gateDenied('customers.edit')) return 0"), true)
eq('kunde-fejl er null', fn.includes('if (custError) return null'), true)
eq('kunde-fejl foer taelling', fn.indexOf('if (custError) return null') < fn.indexOf('countUnlinkedEmailsFromAddress'), true)
const linkFn = action.slice(action.indexOf('export async function linkUnlinkedCustomerEmailsAction'), action.indexOf('export async function linkUnlinkedCustomerEmailsAction') + 900)
eq('ingen adresse bliver', action.includes("error: 'Kunden har ingen mailadresse'"), true)
eq('kobling kaldes stadig', linkFn.includes('linkUnlinkedEmailsFromAddress'), true)

const view = fs.readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')
eq('fejltekst', view.includes('Tidligere mails kunne ikke tælles. Det tælles ikke som 0.'), true)
eq('testid', view.includes('data-testid="customer-mails-unlinked-error"'), true)
eq('knap bliver', view.includes('data-testid="customer-mails-link-old"'), true)
eq('aegte tal viser knap', view.includes('(unlinked ?? 0) > 0'), true)
eq('afsendelse bliver', view.includes('sendEmailToCustomer'), true)
eq('pladsholder-visning bliver', view.includes("endsWith('@elta-crm.local')"), true)
eq('samme kunde ryddes', view.includes('setUnlinked(0)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-unlinked-count-test OK')
process.exitCode = fail ? 1 : 0
