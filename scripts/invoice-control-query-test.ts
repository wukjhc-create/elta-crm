/** Fakturakontrol siger naar faktura, linjer eller katalog fejler. Tom faktura og overpris bliver. Koer: npx tsx scripts/invoice-control-query-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/invoice-control/invoice-control-loader.ts', 'utf8')
eq('fakturafejl', src.includes("if (invError) throw new Error('Kunne ikke hente fakturaen')"), true)
eq('mangler stadig', src.includes('if (!inv) return null'), true)
eq('linjefejl', src.includes("if (linesError) throw new Error('Kunne ikke hente fakturalinjer')"), true)
eq('katalogfejl', src.includes("if (a.error || b.error) throw new Error('Kunne ikke hente katalogpriser')"), true)
eq('gemt vare', src.includes('if (storedRes.error) throw new Error(\'Kunne ikke hente katalogpriser\')'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx', 'utf8')
eq('ny faktura rydder', view.includes('setRes(null)') && view.includes('}, [invoiceId])'), true)
eq('ikke gront bliver', view.includes('Det tælles ikke som at priserne stemmer.'), true)
eq('0 kr bliver', view.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), true)
eq('overpris bliver', view.includes('data-testid="invoice-control-overcharge"'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-control-query-test OK')
process.exitCode = fail ? 1 : 0
