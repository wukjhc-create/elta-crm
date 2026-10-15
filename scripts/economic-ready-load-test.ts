/** Indgaaende faktura siger naar e-conomic-tjekket fejler. Et aegte ikke-opsat svar bliver. Koer: npx tsx scripts/economic-ready-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/page.tsx', 'utf8')
eq('tjek-fejl', page.includes("economicError = 'Kunne ikke tjekke e-conomic'"), true)
eq('aegte klar bliver', page.includes('economicReady = isEconomicReady(await getEconomicSettings())'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="economic-ready-load-error"') && view.includes('Det tælles ikke som at e-conomic mangler. Bogføring er deaktiveret.'), true)
eq('ikke opsat bliver', view.includes('e-conomic er ikke opsat endnu — bogføring er deaktiveret.'), true)
eq('knap kraever klar', view.includes('economicError ? (') && view.includes("economicReady ? ("), true)
eq('bogfor bliver', view.includes('Bogfør til e-conomic'), true)

console.log(fail ? `\n${fail} fejl` : '\neconomic-ready-load-test OK')
process.exitCode = fail ? 1 : 0
