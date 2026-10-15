/** Kundens indbakke beholdes naar samme kunde ikke kan hentes igen. Tom tekst og afsendelse bliver. Koer: npx tsx scripts/customer-inbox-keep-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const view = fs.readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')
eq('samme kunde beholdes', view.includes('loadedFor.current !== key'), true)
eq('fejl rydder ikke listen', view.includes('setLoadError(true)') && view.split('setEmails([])').length === 2, true)
eq('fejl rydder ikke ulaeste', view.split('setUnreadCount(0)').length === 2, true)
eq('spinner kun uden mails', view.includes('loading && emails.length === 0'), true)
eq('fejltekst bliver', view.includes('Kunne ikke hente kundens indbakke.'), true)
eq('ikke tom', view.includes('Det tælles ikke som en tom indbakke.'), true)
eq('proev igen bliver', view.includes('Prøv igen'), true)
eq('afsendelse bliver', view.includes('sendEmailToCustomer'), true)
eq('pladsholder bliver', view.includes('data-testid="customer-email-missing"') || view.includes("endsWith('@elta-crm.local')"), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-inbox-keep-test OK')
process.exitCode = fail ? 1 : 0
