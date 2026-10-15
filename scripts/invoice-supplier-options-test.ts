/** Leverandoervalget siger naar listen ikke kan hentes. Et aegte tomt valg og samme-domaene bliver. Koer: npx tsx scripts/invoice-supplier-options-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke hente leverandører. Det tælles ikke som ingen.'
const action = fs.readFileSync('src/lib/actions/incoming-invoice-supplier.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceSupplierContextAction')
const end = action.indexOf('export async function setIncomingInvoiceSupplierAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('liste siger fejl', fn.includes('if (sup.error)') && fn.includes(msg), true)
eq('fejl foer succes', fn.indexOf('if (sup.error)') < fn.indexOf('success: true'), true)
eq('uden ret bliver', fn.includes("error: 'Manglende tilladelse: incoming_invoices.edit'"), true)
eq('ikke fundet bliver', fn.includes("error: 'Faktura ikke fundet'"), true)
eq('graense bliver', fn.includes('.limit(500)'), true)
eq('samme-domaene vaelter ikke valget', action.includes('return { ids: [], failed: true }') && action.includes('same-domain lookup failed') && action.includes('options:'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/incoming-invoice-supplier-picker.tsx', 'utf8')
eq('banner', view.includes('data-testid="invoice-supplier-load-error"') && view.includes(msg), true)
eq('tomt valg bliver', view.includes('— Ingen leverandør —'), true)
eq('laast skjules stadig', view.includes('if (!ctx || ctx.locked) return null'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-supplier-options-test OK')
process.exitCode = fail ? 1 : 0
