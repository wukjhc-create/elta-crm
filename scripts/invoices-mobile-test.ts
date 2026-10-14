/** Mobilkort på fakturaoverblik og kundens fakturaer. Kør: npx tsx scripts/invoices-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

function between(file: string, start: string, end: string): string {
  const text = fs.readFileSync(file, 'utf8')
  const a = text.indexOf(start)
  const b = text.indexOf(end, a + start.length)
  return a >= 0 && b > a ? text.slice(a, b) : ''
}

const office = between('src/app/dashboard/invoices/invoices-overview-client.tsx', 'data-testid="invoices-mobile-list"', 'hidden md:block')
const customer = between('src/components/modules/customers/customer-invoice-overview.tsx', 'data-testid="customer-invoices-mobile"', 'hidden md:block')

eq('faktura-kort findes', office.length > 0, true)
eq('faktura-kort viser beløb inkl. moms', office.includes('final_amount'), true)
eq('faktura-kort kan stadig påminde efter klik', office.includes('handleReminder(r)') && office.includes('Påmind'), true)
eq('påmind-knappen ligger ikke i faktura-linket', office.indexOf('</Link>') < office.indexOf('Påmind'), true)
eq('faktura-kort har pdf ved siden af linket', office.includes('/api/invoices/') && office.includes('pdf?view=1'), true)
eq('faktura-kort viser ikke kost', /cost_price|margin|contribution|dækningsbidrag/.test(office), false)

eq('kundekortets fakturaer findes', customer.length > 0, true)
eq('kundekortet viser beløb inkl. moms', customer.includes('final_amount'), true)
eq('kundekortet åbner fakturaen og pdf', customer.includes('/dashboard/invoices/') && customer.includes('/api/invoices/'), true)
eq('kundekortet sender ikke påmindelse', customer.includes('handleReminder'), false)
eq('kundekortet viser ikke kost', /cost_price|margin|contribution|dækningsbidrag/.test(customer), false)

console.log(fail ? `\n${fail} fejl` : '\ninvoices-mobile-test OK')
process.exitCode = fail ? 1 : 0
