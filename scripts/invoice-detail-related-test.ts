/** Fakturadetaljen siger naar leverandoer, sag, ordre eller historik fejler. Hovedet bliver. Koer: npx tsx scripts/invoice-detail-related-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceDetailAction')
const end = action.indexOf('export async function approveIncomingInvoiceAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('leverandoer flag', fn.includes('supplier_failed: !!supplierRes.error'), true)
eq('sag flag', fn.includes('case_failed: !!caseRes.error'), true)
eq('ordre flag', fn.includes('work_order_failed: !!woRes.error'), true)
eq('historik flag', fn.includes('audit_failed: !!auditRes.error'), true)
eq('linjer bliver', fn.includes('lines_failed: !!linesRes.error'), true)
eq('iban bliver', fn.includes('invoice.iban = maskIban(invoice.iban)'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('leverandoer-banner', view.includes('data-testid="incoming-invoice-supplier-error"'), true)
eq('sag-banner', view.includes('data-testid="incoming-invoice-case-error"'), true)
eq('ordre-banner', view.includes('data-testid="incoming-invoice-work-order-error"'), true)
eq('historik-banner', view.includes('data-testid="incoming-invoice-audit-error"'), true)
eq('ikke matchet bliver', view.includes('Ikke matchet'), true)
eq('ingen wo bliver', view.includes('Ingen specifik WO'), true)
eq('tom historik bliver', view.includes('Ingen log-poster endnu.'), true)
eq('match-advarsel kraever aegte tom', view.includes('!detail.case && !detail.case_failed'), true)
eq('skift sag naar id findes', view.includes("detail.case || inv.matched_case_id ? 'Skift sag' : 'Match til sag'"), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-detail-related-test OK')
process.exitCode = fail ? 1 : 0
