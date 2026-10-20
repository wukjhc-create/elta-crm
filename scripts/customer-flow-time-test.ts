/** Kundens sidste kontakt og flowdato er københavnsk. Trinnene bliver. Kør: npx tsx scripts/customer-flow-time-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const long = new Date('2026-10-14T22:30:00Z').toLocaleDateString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
eq('sen aften er den 15', long.startsWith('15'), true)
eq('sen aften er oktober', long.toLowerCase().includes('oktober'), true)
eq('sen aften er ikke utc-dagen', long.startsWith('14'), false)

const src = fs.readFileSync('src/components/modules/customers/customer-status-flow.tsx', 'utf8')
eq('sidste kontakt er koebenhavn', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'long', year: 'numeric' })"), true)
eq('skrivebord er koebenhavn', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short' })"), true)
eq('mobil er koebenhavn', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short', year: 'numeric' })"), true)
eq('flow hentes stadig', src.includes('getCustomerFlow(customerId, customerEmail)'), true)
eq('faerdig bliver', src.includes("label: 'Færdig'"), true)
eq('rykker bliver', src.includes("label: 'Rykker sendt'"), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-flow-time-test OK')
process.exitCode = fail ? 1 : 0
