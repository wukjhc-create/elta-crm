/** Valgt leverandoer siger naar opslaget fejler. Ikke-fundet og gem bliver. Koer: npx tsx scripts/invoice-supplier-exists-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke tjekke leverandøren. Det tælles ikke som at den ikke findes.'
const action = fs.readFileSync('src/lib/actions/incoming-invoice-supplier.ts', 'utf8')
const start = action.indexOf('export async function setIncomingInvoiceSupplierAction')
const end = action.indexOf('export async function createSupplierFromIncomingInvoiceAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('tjek foer ikke-fundet', fn.indexOf('if (supErr)') < fn.indexOf("error: 'Leverandør ikke fundet'"), true)
eq('siger fejl', fn.includes(msg), true)
eq('logger fejlen', fn.includes("logger.error('incoming-invoice-supplier: supplier read failed'"), true)
eq('ikke-fundet bliver', fn.includes("error: 'Leverandør ikke fundet'"), true)
eq('laesefejl paa faktura bliver', fn.includes('Kunne ikke læse fakturaen. Det tælles ikke som at den ikke findes.'), true)
eq('afsluttet bliver', fn.includes('leverandøren kan ikke ændres'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/incoming-invoice-supplier-picker.tsx', 'utf8')
eq('gem viser fejlteksten', view.includes("r.error ?? 'Kunne ikke gemme'"), true)
eq('tomt valg bliver', view.includes('— Ingen leverandør —'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-supplier-exists-test OK')
process.exitCode = fail ? 1 : 0
