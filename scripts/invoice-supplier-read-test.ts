/** Fakturaen siger naar den ikke kan laeses. Ikke-fundet og listen bliver. Koer: npx tsx scripts/invoice-supplier-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læse fakturaen. Det tælles ikke som at den ikke findes.'
const action = fs.readFileSync('src/lib/actions/incoming-invoice-supplier.ts', 'utf8')
const start = action.indexOf('async function loadInvoice')
const end = action.indexOf('async function senderOf')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl foer tom', fn.indexOf('if (error)') < fn.indexOf('failed: false'), true)
eq('logger fejlen', fn.includes("logger.error('incoming-invoice-supplier: read failed'"), true)

for (const name of ['getIncomingInvoiceSupplierContextAction', 'setIncomingInvoiceSupplierAction', 'createSupplierFromIncomingInvoiceAction']) {
  const from = action.indexOf(`export async function ${name}`)
  const next = action.indexOf('\nexport async function ', from + 10)
  const body = action.slice(from, next === -1 ? action.length : next)
  eq(`${name} siger laesefejl`, body.includes(msg), true)
  eq(`${name} ikke-fundet bliver`, body.indexOf(msg) < body.indexOf("error: 'Faktura ikke fundet'"), true)
}

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/incoming-invoice-supplier-picker.tsx', 'utf8')
eq('valg viser fejlteksten', view.includes('setLoadError(r.error || '), true)
eq('tomt valg bliver', view.includes('— Ingen leverandør —'), true)
eq('liste-fejl bliver', view.includes('data-testid="invoice-supplier-load-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-supplier-read-test OK')
process.exitCode = fail ? 1 : 0
