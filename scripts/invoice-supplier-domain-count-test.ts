/** Samme-domaene siger naar soegningen fejler. Listen og et aegte 0 bliver. Koer: npx tsx scripts/invoice-supplier-domain-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Andre fakturaer fra afsenderen kunne ikke tælles. Det tælles ikke som 0.'
const action = fs.readFileSync('src/lib/actions/incoming-invoice-supplier.ts', 'utf8')
const start = action.indexOf('async function sameDomainOpenInvoices')
const end = action.indexOf('async function linkSupplier')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('mail siger fejl', fn.includes('if (mailError)') && fn.includes('failed: true'), true)
eq('opslag siger fejl', fn.includes('same-domain lookup failed') && fn.includes('return { ids: [], failed: true }'), true)
eq('uden domaene er 0', fn.includes('if (!domain) return { ids: [], failed: false }'), true)
eq('ingen mails er 0', fn.includes('if (!ids.length) return { ids: [], failed: false }'), true)
eq('graense bliver', fn.includes('.limit(500)'), true)

const ctxStart = action.indexOf('export async function getIncomingInvoiceSupplierContextAction')
const ctxEnd = action.indexOf('export async function setIncomingInvoiceSupplierAction')
const ctx = action.slice(ctxStart, ctxEnd)
eq('liste bliver', ctx.includes('Kunne ikke hente leverandører. Det tælles ikke som ingen.'), true)
eq('fejlet afsender soeger ikke', ctx.includes('if (!domain.failed)') === false && ctx.includes('domain.failed'), true)
eq('taelling skjuler ikke listen', ctx.includes('same_domain_failed: sameDomain.failed') && ctx.includes('options:'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/incoming-invoice-supplier-picker.tsx', 'utf8')
eq('banner', view.includes('data-testid="invoice-supplier-domain-count-error"') && view.includes(msg), true)
eq('afsender-banner bliver', view.includes('data-testid="invoice-supplier-sender-error"'), true)
eq('liste-fejl bliver', view.includes('data-testid="invoice-supplier-load-error"'), true)
eq('tomt valg bliver', view.includes('— Ingen leverandør —'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-supplier-domain-count-test OK')
process.exitCode = fail ? 1 : 0
