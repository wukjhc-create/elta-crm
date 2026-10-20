/** Skrivebordets linje siger ikke konverteret, ligesom kortet. Beløb og knapper bliver. Kør: npx tsx scripts/invoice-line-conversion-text-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const start = src.indexOf('data-testid="incoming-invoice-lines-mobile"')
const end = src.indexOf('hidden md:block overflow-x-auto', start)
const mobile = src.slice(start, end)
const desktop = src.slice(end)
eq('kortet siger ikke konverteret', mobile.includes('Ikke konverteret'), true)
eq('bordet siger ikke konverteret', desktop.includes('Ikke konverteret'), true)
eq('materiale bliver', desktop.includes('>Materiale<') || desktop.includes('Materiale'), true)
eq('sprunget over bliver', desktop.includes('Sprunget over'), true)
eq('beloeb bliver', src.includes('fmtAmount(l.total_price, inv.currency)'), true)
eq('bogfoer bliver', src.includes('Bogfør til e-conomic'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-line-conversion-text-test OK')
process.exitCode = fail ? 1 : 0
