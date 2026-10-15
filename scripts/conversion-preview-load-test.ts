/** Konverteringsvisning siger naar faktura eller linjer ikke kan laeses. Ikke-fundet og kun-total bliver. Koer: npx tsx scripts/conversion-preview-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const readMsg = 'Kunne ikke læse fakturaen. Det tælles ikke som at den ikke findes.'
const lineMsg = 'Kunne ikke hente linjerne. Det tælles ikke som en faktura uden linjer.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceConversionPreviewAction')
const end = action.indexOf('export async function uploadIncomingInvoiceAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fakturafejl foer ikke-fundet', fn.indexOf('if (invErr)') < fn.indexOf("message: 'Faktura ikke fundet'"), true)
eq('faktura siger fejl', fn.includes(readMsg), true)
eq('linjer foer kun-total', fn.indexOf('if (lineErr)') < fn.indexOf('total_only: !hasLines'), true)
eq('linjer siger fejl', fn.includes(lineMsg), true)
eq('ikke-fundet bliver', fn.includes("message: 'Faktura ikke fundet'"), true)
eq('kun-total bliver', fn.includes('total_only: !hasLines && inv.amount_incl_vat != null && Number(inv.amount_incl_vat) > 0'), true)
eq('antal bliver', fn.includes('Number.isFinite(qty) && qty > 0 ? qty : 1'), true)
eq('uden ret bliver', fn.includes("message: 'Manglende tilladelse: incoming_invoices.view'"), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
eq('banner', view.includes('data-testid="conversion-preview-load-error"') && view.includes('text-red-800'), true)
eq('kun-total tekst bliver', view.includes('Ingen fakturalinjer — kun et totalbeløb.'), true)
eq('ingen linjer bliver', view.includes('Ingen linjer at konvertere.'), true)
eq('intet bogfoeres', !view.includes('approveInvoice'), true)

console.log(fail ? `\n${fail} fejl` : '\nconversion-preview-load-test OK')
process.exitCode = fail ? 1 : 0
