/** Afsenderen siger naar mailen ikke kan laeses. Listen og en aegte privat mail bliver. Koer: npx tsx scripts/invoice-supplier-sender-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Afsenderen kunne ikke læses. Det tælles ikke som en privat mail.'
const action = fs.readFileSync('src/lib/actions/incoming-invoice-supplier.ts', 'utf8')
const senderStart = action.indexOf('async function senderOf')
const senderEnd = action.indexOf('async function sameDomainOpenInvoices')
const sender = action.slice(senderStart, senderEnd)
eq('laeser fejlen', sender.includes('if (error)') && sender.includes('failed: true'), true)
eq('uden mail er ikke fejl', sender.includes('if (!sourceEmailId) return { domain: null, failed: false }'), true)
eq('domaene bliver', sender.includes('senderDomain(row?.original_sender_email || row?.sender_email)'), true)

const ctxStart = action.indexOf('export async function getIncomingInvoiceSupplierContextAction')
const ctxEnd = action.indexOf('export async function setIncomingInvoiceSupplierAction')
const ctx = action.slice(ctxStart, ctxEnd)
eq('liste siger stadig fejl', ctx.includes('Kunne ikke hente leverandører. Det tælles ikke som ingen.'), true)
eq('afsender skjuler ikke listen', ctx.includes('sender_failed: domain.failed') && ctx.includes('options:'), true)
eq('fejlet afsender soeger ikke samme domaene', ctx.indexOf('? { ids: [] as string[], failed: false }') < ctx.indexOf('sameDomainOpenInvoices(ctx, domain.domain'), true)

const createStart = action.indexOf('export async function createSupplierFromIncomingInvoiceAction')
const create = action.slice(createStart)
eq('opret stopper foer insert', create.indexOf('if (sender.failed)') < create.indexOf(".insert("), true)
eq('opret siger privat-mail', create.includes(msg), true)
eq('website bliver domaenet', create.includes('website: sender.domain'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/incoming-invoice-supplier-picker.tsx', 'utf8')
eq('banner', view.includes('data-testid="invoice-supplier-sender-error"') && view.includes(msg), true)
eq('gmail-tekst bliver', view.includes('Ingen firma-afsender på mailen (fx gmail)'), true)
eq('tomt valg bliver', view.includes('— Ingen leverandør —'), true)
eq('liste-fejl bliver', view.includes('data-testid="invoice-supplier-load-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-supplier-sender-test OK')
process.exitCode = fail ? 1 : 0
