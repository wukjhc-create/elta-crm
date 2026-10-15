/** Sagens leverandørfakturaer på små skærme. Kør: npx tsx scripts/case-supplier-invoices-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-economy-tab.tsx', 'utf8')
const mobileStart = src.indexOf('data-testid="case-supplier-invoices-mobile"')
const tableStart = src.indexOf('hidden md:block rounded ring-1 ring-gray-200 overflow-x-auto')
const mobile = src.slice(mobileStart, tableStart)

eq('mobil-liste findes', mobileStart > 0, true)
eq('tabellen er skjult under md', tableStart > mobileStart, true)
eq('kortet viser leverandør, nummer og beløb inkl. moms', mobile.includes('supplier_name') && mobile.includes('invoice_number') && mobile.includes('amount_incl_vat') && mobile.includes('Beløb inkl. moms'), true)
eq('ukonverterede linjer står som tekst', mobile.includes('ikke konverteret'), true)
eq('åbn er et eget link', mobile.includes('href={`/dashboard/incoming-invoices/${row.id}`}') && mobile.includes('Åbn faktura'), true)
eq('desktop beholder aria-label på ikonet', src.includes('aria-label="Åbn faktura"'), true)
eq('kortet indeholder ikke tabellen', mobile.includes('<table'), false)

console.log(fail ? `\n${fail} fejl` : '\ncase-supplier-invoices-mobile-test OK')
process.exitCode = fail ? 1 : 0
