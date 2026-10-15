/** Konvertering siger naar leverandoernavnet ikke kan laeses. Linjer og et tomt navn bliver. Koer: npx tsx scripts/conversion-preview-supplier-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Navnet kunne ikke hentes. Det tælles ikke som ingen leverandør.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceConversionPreviewAction')
const end = action.indexOf('export async function uploadIncomingInvoiceAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('navn siger fejl', fn.includes('if (supErr)') && fn.includes('supplierFailed = true'), true)
eq('flag paa svaret', fn.includes('supplier_failed: supplierFailed'), true)
eq('udtrukket navn bliver', fn.includes('inv.supplier_name_extracted'), true)
eq('linjer siger stadig fejl', fn.includes('Kunne ikke hente linjerne. Det tælles ikke som en faktura uden linjer.'), true)
eq('sag siger stadig fejl', fn.includes('caseFailed = true'), true)
eq('kun-total bliver', fn.includes('total_only: !hasLines'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
eq('banner', view.includes('data-testid="conversion-preview-supplier-error"') && view.includes(msg), true)
eq('sag-banner bliver', view.includes('data-testid="conversion-preview-case-error"'), true)
eq('linje-fejl bliver', view.includes('data-testid="conversion-preview-load-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\nconversion-preview-supplier-test OK')
process.exitCode = fail ? 1 : 0
