/** Fakturaens regnskabspanel siger naar e-conomic-tjekket fejler. Et aegte ikke-opsat svar bliver. Eksport bliver slaaet fra. Koer: npx tsx scripts/invoice-accounting-ready-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/accounting.ts', 'utf8')
const start = action.indexOf('export async function getInvoiceAccountingStatusAction')
const end = action.indexOf('export interface ExportInvoiceResult')
const fn = action.slice(start, end)
eq('funktion fundet', start > 0 && end > start, true)
eq('tjek-fejl', fn.includes("integrationError = 'Kunne ikke tjekke e-conomic'"), true)
eq('aegte klar bliver', fn.includes('integrationReady = isEconomicReady(await getEconomicSettings())'), true)
eq('returnerer fejl', fn.includes('integration_error: integrationError'), true)

const view = fs.readFileSync('src/components/modules/invoices/invoice-accounting-panel.tsx', 'utf8')
eq('banner', view.includes('data-testid="invoice-accounting-ready-error"') && view.includes('Det tælles ikke som at e-conomic mangler. Eksport er deaktiveret.'), true)
eq('ikke opsat bliver', view.includes('e-conomic er ikke opsat endnu. Når integrationen er konfigureret, kan fakturaer eksporteres herfra.'), true)
eq('amber kun uden fejl', view.includes('!state.integration_error && !state.integration_ready'), true)
eq('eksport kraever klar', view.includes("canExport && state.integration_ready && state.status !== 'exported' && state.status !== 'needs_fix'"), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-accounting-ready-load-test OK')
process.exitCode = fail ? 1 : 0
