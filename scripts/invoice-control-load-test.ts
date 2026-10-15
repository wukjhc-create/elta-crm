/** Fakturakontrol siger naar hentningen kaster. Overpris og 0 kr-reglen bliver. Koer: npx tsx scripts/invoice-control-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx', 'utf8')
eq('kast siges', src.includes("setError('Kunne ikke kontrollere priser')"), true)
eq('ikke gront', src.includes('Det tælles ikke som at priserne stemmer.'), true)
eq('0 kr bliver', src.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), true)
eq('overpris bliver', src.includes('data-testid="invoice-control-overcharge"'), true)
eq('daekning bliver', src.includes('res.control.controlledLines === 0'), true)
eq('kontrollerer stadig', src.includes('Kontrollerer priser…'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-control-load-test OK')
process.exitCode = fail ? 1 : 0
