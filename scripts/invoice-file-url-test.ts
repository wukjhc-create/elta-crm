/** Bilagslinket siger naar fakturaen ikke kan laeses. Ingen fil og det signerede link bliver. Koer: npx tsx scripts/invoice-file-url-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læse bilaget. Det tælles ikke som at der ingen fil er.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceFileUrlAction')
const end = action.indexOf('export async function getIncomingInvoiceDueSummaryAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl foer ingen fil', fn.indexOf('if (error)') < fn.indexOf("message: 'Ingen fil tilknyttet'"), true)
eq('siger fejl', fn.includes(msg), true)
eq('logger fejlen', fn.includes("logger.error('getIncomingInvoiceFileUrlAction failed'"), true)
eq('ingen fil bliver', fn.includes("message: 'Ingen fil tilknyttet'"), true)
eq('uden ret bliver', fn.includes("message: 'Manglende tilladelse: incoming_invoices.view'"), true)
eq('signering bliver', fn.includes("message: 'Kunne ikke generere bilags-link'"), true)
eq('ekstern url bliver', fn.includes("cls.kind === 'external'"), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('klik viser fejlteksten', view.includes("res.message ?? 'Kunne ikke åbne bilag'"), true)
eq('tomt bilag bliver', view.includes('Ingen fil tilknyttet (kilde:'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-file-url-test OK')
process.exitCode = fail ? 1 : 0
