/** Fakturahoved siger naar fakturaen ikke kan laeses. Ikke-fundet og laas bliver. Koer: npx tsx scripts/invoice-header-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læse fakturaen. Det tælles ikke som at den ikke findes.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function editIncomingInvoiceHeaderAction')
const end = action.indexOf('export async function getApprovalQueueCountsAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('laesefejl foer ikke-fundet', fn.indexOf('if (readErr)') < fn.indexOf("message: 'Faktura ikke fundet'"), true)
eq('siger fejl', fn.includes(msg), true)
eq('logger fejlen', fn.includes("logger.error('editIncomingInvoiceHeaderAction read failed'"), true)
eq('ikke-fundet bliver', fn.includes("message: 'Faktura ikke fundet'"), true)
eq('laas bliver', fn.includes('fakturahovedet kan ikke rettes'), true)
eq('uden ret bliver', fn.includes("message: 'Manglende tilladelse: incoming_invoices.edit'"), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/header-edit-form.tsx', 'utf8')
eq('formular viser fejl', view.includes('data-testid="header-edit-error"') && view.includes('setError(r.message)'), true)
eq('momsregel bliver', view.includes('Ekskl. + moms skal give inkl. moms.'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-header-read-test OK')
process.exitCode = fail ? 1 : 0
