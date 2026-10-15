/** Genbogfoering siger naar fakturaen ikke kan laeses. Den sender ikke, og ikke-fundet bliver. Koer: npx tsx scripts/invoice-repost-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læse fakturaen. Det tælles ikke som at den ikke findes.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function postIncomingInvoiceToEconomicAction')
const end = action.indexOf('export async function getIncomingInvoiceFileUrlAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('laesefejl foer ikke-fundet', fn.indexOf('if (readErr)') < fn.indexOf("message: 'Faktura ikke fundet'"), true)
eq('laesefejl foer bogfoering', fn.indexOf('if (readErr)') < fn.indexOf('pushSupplierInvoiceToEconomic'), true)
eq('siger fejl', fn.includes(msg), true)
eq('status er failed', fn.includes("status: 'failed', message: '" + msg + "'"), true)
eq('ikke-fundet bliver', fn.includes("status: 'not_eligible', message: 'Faktura ikke fundet'"), true)
eq('allerede bogfoert bliver', fn.includes('Fakturaen er allerede bogført i e-conomic.'), true)
eq('kun godkendte bliver', fn.includes('Kun godkendte fakturaer kan bogføres'), true)
eq('uden ret bliver', fn.includes("message: 'Manglende tilladelse: incoming_invoices.approve'"), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('siden viser svaret', view.includes('setMsg({ ok: res.ok, text: res.message })'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-repost-read-test OK')
process.exitCode = fail ? 1 : 0
