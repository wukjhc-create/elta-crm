/** Sag-tilknytning siger naar fakturaen ikke kan laeses. Ikke-fundet og afsluttet bliver. Koer: npx tsx scripts/invoice-case-match-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læse fakturaen. Det tælles ikke som at den ikke findes.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function setIncomingInvoiceCaseAction')
const end = action.indexOf('export async function editIncomingInvoiceHeaderAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('laesefejl foer ikke-fundet', fn.indexOf('if (readErr)') < fn.indexOf("message: 'Faktura ikke fundet'"), true)
eq('siger fejl', fn.includes(msg), true)
eq('logger fejlen', fn.includes("logger.error('setIncomingInvoiceCaseAction read failed'"), true)
eq('ikke-fundet bliver', fn.includes("message: 'Faktura ikke fundet'"), true)
eq('afsluttet bliver', fn.includes('sag-tilknytning kan ikke ændres'), true)
eq('uden ret bliver', fn.includes("message: 'Manglende tilladelse: incoming_invoices.edit'"), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('vaelger viser fejl', view.includes('setCasePickerError(r.message)'), true)
eq('ryd viser fejl', view.includes('flash(r.ok, r.message)'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-case-match-read-test OK')
process.exitCode = fail ? 1 : 0
