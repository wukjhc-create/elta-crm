/** Fakturadetaljen siger naar linjerne ikke kan hentes. Hovedet og den tomme tekst bliver. Koer: npx tsx scripts/invoice-detail-lines-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Linjerne kunne ikke hentes. Det tælles ikke som ingen linjer.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceDetailAction')
const end = action.indexOf('export async function approveIncomingInvoiceAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('linjer siger fejl', fn.includes('if (linesRes.error)') && fn.includes('lines_failed: !!linesRes.error'), true)
eq('fejl bliver ikke linjer', fn.includes('linesRes.error ? [] : (linesRes.data ?? [])'), true)
eq('uden ret bliver null', fn.includes("if (!hasPermission('incoming_invoices.view')) return null"), true)
eq('iban bliver maskeret', fn.includes('invoice.iban = maskIban(invoice.iban)'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="incoming-invoice-lines-error"') && view.includes(msg), true)
eq('tom tekst bliver', view.includes('Ingen linjer ekstraheret. Uden linjer er der ikke noget at kontrollere.'), true)
eq('banner foer tom', view.indexOf('incoming-invoice-lines-error') < view.indexOf('Ingen linjer ekstraheret.'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-detail-lines-test OK')
process.exitCode = fail ? 1 : 0
