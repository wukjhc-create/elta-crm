/** Leverandoerfakturaens liste siger naar beloeb eller leverandoer mangler. Kendte beloeb bliver. Koer: npx tsx scripts/invoice-list-missing-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
eq('beloeb mangler siger det', src.includes("? 'Beløb mangler'"), true)
eq('kendt beloeb bliver', src.includes("style: 'currency', currency: ccy, maximumFractionDigits: 2"), true)
eq('leverandoer mangler siger det', src.split("r.supplier_name || 'Leverandør mangler'").length === 3, true)
eq('fakturanummer uden tal bliver streg', src.includes('r.invoice_number ?? \'—\''), true)
eq('tom liste bliver', src.includes('Ingen fakturaer i denne kategori.'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-list-missing-test OK')
process.exitCode = fail ? 1 : 0
