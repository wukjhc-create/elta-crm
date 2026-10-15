/** Kundens sager og mailens sagsvaelger siger naar hentningen fejler. Tom tekst og kobling bliver. Koer: npx tsx scripts/customer-cases-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const tab = fs.readFileSync('src/components/modules/customers/customer-cases-tab.tsx', 'utf8')
eq('samme kunde beholdes', tab.includes('loadedFor.current !== customerId'), true)
eq('fejl rydder ikke igen', tab.split('setCases([])').length === 2, true)
eq('fejl siger det', tab.includes('data-testid="customer-cases-load-error"') && tab.includes('Det tælles ikke som ingen sager.'), true)
eq('tom liste bliver', tab.includes('Ingen sager endnu'), true)
eq('ordrer bliver', tab.includes('href="/dashboard/orders"'), true)

const mail = fs.readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
eq('mail samme kunde beholdes', mail.includes('loadedCustomer.current !== customerId'), true)
eq('mail fejl rydder ikke igen', mail.split('setCases([])').length === 2, true)
eq('mail fejl siger det', mail.includes('data-testid="mail-case-picker-load-error"'), true)
eq('ingen sager bliver', mail.includes('Kunden har ingen sager endnu'), true)
eq('vaelger bliver klippet', mail.includes('max-w-[280px] truncate'), true)
eq('kobling bliver', mail.includes('linkEmailToCase(emailId, newCaseId)'), true)

const action = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getCustomerServiceCases'), action.indexOf('// =====================================================\n// Stats'))
eq('uden adgang bliver tom', fn.includes("if (!hasPermission('cases.view.all')) return []"), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-cases-load-test OK')
process.exitCode = fail ? 1 : 0
