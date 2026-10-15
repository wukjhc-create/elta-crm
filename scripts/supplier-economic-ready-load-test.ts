/** Leverandørfakturans forhåndsvisning siger naar indstillinger, leverandør eller linjer ikke kan hentes. Et aegte ikke-opsat svar bliver. Der bogføres ikke. Koer: npx tsx scripts/supplier-economic-ready-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/services/economic-client.ts', 'utf8')
const start = src.indexOf('export async function previewSupplierInvoiceForEconomic')
const end = src.indexOf('export async function previewPaymentForEconomic')
const fn = src.slice(start, end)
eq('funktion fundet', start > 0 && end > start, true)
eq('linjer fejler lukket', fn.includes("if (linesRes.error) return { ok: false, error: 'Kunne ikke hente fakturalinjer' }"), true)
eq('tjek-fejl', fn.includes("settingsRes.error ? 'Kunne ikke tjekke e-conomic' : null"), true)
eq('leverandoer-fejl', fn.includes("supplierRes.error ? 'Kunne ikke hente leverandøren' : null"), true)
eq('aegte klar bliver', fn.includes('Boolean(s?.active && s?.api_token && s?.agreement_grant_token)'), true)
eq('intet bogfoeres', !fn.includes('pushSupplierInvoiceToEconomic'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/supplier-economic-preview.tsx', 'utf8')
eq('tjek-banner', view.includes('data-testid="supplier-economic-ready-error"') && view.includes('Det tælles ikke som at e-conomic mangler. Godkendelse bogfører intet herfra.'), true)
eq('ikke opsat bliver', view.includes('e-conomic er ikke opsat — godkendelse bogfører intet endnu.') && view.includes('!data.integration_error && !data.integration_ready'), true)
eq('leverandoer-banner', view.includes('data-testid="supplier-economic-supplier-error"') && view.includes('Det tælles ikke som at leverandøren mangler.'), true)
eq('ikke koblet bliver', view.includes('leverandør ikke koblet'), true)
eq('intet sendes', view.includes('Forhåndsvisning — intet sendes til e-conomic herfra.'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-economic-ready-load-test OK')
process.exitCode = fail ? 1 : 0
