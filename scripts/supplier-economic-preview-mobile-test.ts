/** e-conomic-forhaandsvisning viser linjer som kort. Beløb sendes ikke. Koer: npx tsx scripts/supplier-economic-preview-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/supplier-economic-preview.tsx', 'utf8')
const start = src.indexOf('data-testid="supplier-economic-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words">{l.description}'), true)
eq('konto og beloeb bliver', mobile.includes('l.costAccount.accountNumber') && mobile.includes('fmt(l.amount)'), true)
eq('netto-testid bliver', src.includes('data-testid="supplier-economic-net"') && src.includes('fmt(data.draft.economicNet)'), true)
eq('intet sendes', src.includes('Forhåndsvisning — intet sendes til e-conomic herfra.'), true)
eq('kun preview-action', src.includes('getSupplierInvoiceEconomicPreviewAction') && !src.includes('postToEconomic'), true)
eq('kladdehovedet ombrydes', src.includes('text-xs text-gray-600 break-words'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-economic-preview-mobile-test OK')
process.exitCode = fail ? 1 : 0
