/** Kundekortet viser CVR naar det findes. Mail og kundenummer bliver. Koer: npx tsx scripts/customers-mobile-cvr-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customers-table.tsx', 'utf8')
const start = src.indexOf('data-testid="customers-mobile-list"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('cvr vises', mobile.includes('data-testid="customer-mobile-cvr"') && mobile.includes('CVR: {customer.vat_number}'), true)
eq('cvr ombrydes', mobile.includes('break-words" data-testid="customer-mobile-cvr"'), true)
eq('tomt cvr skjules', mobile.includes('customer.vat_number &&'), true)
eq('kundenummer bliver', mobile.includes('customer.customer_number'), true)
eq('mail bliver', mobile.includes('{customer.email}'), true)
eq('desktop-cvr bliver', src.includes('CVR: {customer.vat_number}'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomers-mobile-cvr-test OK')
process.exitCode = fail ? 1 : 0
