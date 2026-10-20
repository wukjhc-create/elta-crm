/** Kundefakturans forhåndsvisning siger naar faktura, linjer, kunde eller indstillinger ikke kan hentes. Et aegte tomt svar og "ny kunde" bliver. Der eksporteres ikke. Koer: npx tsx scripts/invoice-preview-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/services/economic-client.ts', 'utf8')
const start = src.indexOf('export async function previewInvoiceForEconomic')
const end = src.indexOf('export interface EconomicSupplierInvoicePreview')
const fn = src.slice(start, end)
eq('funktion fundet', start > 0 && end > start, true)
eq('fakturafejl foer ikke-fundet', fn.indexOf('if (invErr)') < fn.indexOf("error: 'Faktura ikke fundet'"), true)
eq('fakturafejl', fn.includes("error: 'Kunne ikke hente fakturaen. Det tælles ikke som at fakturaen mangler.'"), true)
eq('linjer fejler lukket', fn.includes("error: 'Kunne ikke hente fakturalinjer. Det tælles ikke som ingen linjer.'"), true)
eq('kunde-fejl', fn.includes("customerRes.error ? 'Kunne ikke hente kunden' : null"), true)
eq('tjek-fejl', fn.includes("settingsRes.error ? 'Kunne ikke tjekke e-conomic' : null"), true)
eq('ingen kunde bliver', fn.includes("message: 'Fakturaen har ingen kunde'"), true)
eq('aegte klar bliver', fn.includes('Boolean(s?.active && s?.api_token && s?.agreement_grant_token)'), true)

const view = fs.readFileSync('src/components/modules/invoices/invoice-accounting-panel.tsx', 'utf8')
eq('liste-banner', view.includes('data-testid="economic-preview-load-error"'), true)
eq('kunde-banner', view.includes('data-testid="economic-preview-customer-error"') && view.includes('Det tælles ikke som en ny kunde.'), true)
eq('ny kunde bliver', view.includes('ny kunde'), true)
eq('tjek-banner', view.includes('data-testid="economic-preview-ready-error"') && view.includes('Det tælles ikke som at e-conomic mangler.'), true)
eq('intet sendes', view.includes('Forhåndsvisning — intet sendes til e-conomic herfra.'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-preview-load-test OK')
process.exitCode = fail ? 1 : 0
