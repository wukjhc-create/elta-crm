/** Fakturaer på sagen, små skærme. Kør: npx tsx scripts/case-invoices-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-invoices-list.tsx', 'utf8')
const mobileStart = src.indexOf('data-testid="case-invoices-mobile"')
const tableStart = src.indexOf('hidden md:block overflow-x-auto')
const mobile = src.slice(mobileStart, tableStart)

eq('mobil-liste findes', mobileStart > 0, true)
eq('tabellen er skjult under md', tableStart > mobileStart, true)
eq('kortet viser nummer, status og beloeb inkl. moms', mobile.includes('invoice_number') && mobile.includes('sb.label') && mobile.includes('final_amount') && mobile.includes('inkl. moms'), true)
eq('aabn, pdf og hent er egne links', mobile.includes('Åbn') && mobile.includes('pdf?view=1') && mobile.includes('> Hent'), true)
eq('kortet viser ikke kost eller db', /cost_price|margin|contribution|dækningsbidrag/.test(mobile), false)
eq('desktop beholder download-titel', src.includes('title="Download PDF"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-invoices-mobile-test OK')
process.exitCode = fail ? 1 : 0
