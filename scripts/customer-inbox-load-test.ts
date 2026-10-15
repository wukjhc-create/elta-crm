/** Kundens indbakke siger naar hentningen fejler. Tom tekst og afsendelse bliver. Koer: npx tsx scripts/customer-inbox-load-test.ts */
import fs from 'fs'
import { throwIfQueryError } from '../src/lib/data/rows-or-throw'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

let threw = ''
try {
  throwIfQueryError({ message: 'db' }, 'Kunne ikke hente kundens indbakke')
} catch (err) {
  threw = err instanceof Error ? err.message : 'andet'
}
eq('fejl kastes', threw, 'Kunne ikke hente kundens indbakke')
eq('uden fejl bliver', (() => { throwIfQueryError(null); return 'ok' })(), 'ok')

const action = fs.readFileSync('src/lib/actions/customer-mailbox.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getCustomerMailbox'), action.indexOf('const emails: CustomerMailboxEmail'))
eq('uden adgang bliver tom', fn.includes('if (!access.view) return { emails: [], unreadCount: 0, conversations: [], canReply: false }'), true)
eq('query-fejl kastes', fn.includes("throwIfQueryError(error, 'Kunne ikke hente kundens indbakke')"), true)
eq('tom retur paa fejl er vaek', fn.includes('Failed to fetch customer mailbox') && !fn.includes('return { emails: [], unreadCount: 0, conversations: [], canReply: false }\n  }'), true)

const view = fs.readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')
eq('fejltekst', view.includes('Kunne ikke hente kundens indbakke.'), true)
eq('ikke tom', view.includes('Det tælles ikke som en tom indbakke.'), true)
eq('tom send bliver', view.includes("'Send den første email med knappen ovenfor'"), true)
eq('uden mail bliver', view.includes('Kunden mangler e-mail, så der kan ikke sendes herfra'), true)
eq('afsendelse bliver', view.includes('sendEmailToCustomer'), true)
eq('kan proeves igen', view.includes('Prøv igen'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-inbox-load-test OK')
process.exitCode = fail ? 1 : 0
