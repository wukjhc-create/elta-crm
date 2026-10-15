/** Revisionsloggen siger naar navnet ikke kan hentes. Posterne bliver. Koer: npx tsx scripts/invoice-detail-names-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Medarbejdernavne kunne ikke hentes. Det tælles ikke som ingen afsender.'
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
const start = action.indexOf('export async function getIncomingInvoiceDetailAction')
const end = action.indexOf('export async function approveIncomingInvoiceAction')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('navne siger fejl', fn.includes('if (profileErr)') && fn.includes('auditNamesFailed = true'), true)
eq('flag paa svaret', fn.includes('audit_names_failed: auditNamesFailed'), true)
eq('poster bliver ved navnefejl', fn.indexOf('if (profileErr)') < fn.indexOf('audit: (auditRes.error ? [] : (auditRes.data ?? [])).map'), true)
eq('historik-flag bliver', fn.includes('audit_failed: !!auditRes.error'), true)

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="incoming-invoice-audit-names-error"') && view.includes(msg), true)
eq('historik-banner bliver', view.includes('data-testid="incoming-invoice-audit-error"'), true)
eq('tom historik bliver', view.includes('Ingen log-poster endnu.'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-detail-names-test OK')
process.exitCode = fail ? 1 : 0
