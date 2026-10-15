/** Fakturaoverblik siger naar e-conomic-tjekket fejler. Et aegte ikke-opsat svar bliver. Eksport bliver slaaet fra. Koer: npx tsx scripts/invoice-overview-economic-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/invoices.ts', 'utf8')
const start = action.indexOf('export async function listInvoicesOverviewAction')
const end = action.indexOf('export interface DashboardOverdueRow')
const fn = action.slice(start, end)
eq('funktion fundet', start > 0 && end > start, true)
eq('tjek-fejl', fn.includes("accountingError = 'Kunne ikke tjekke e-conomic'"), true)
eq('aegte klar bliver', fn.includes('accountingReady = isEconomicReady(await getEconomicSettings())'), true)
eq('returnerer fejl', fn.includes('accounting_error: accountingError'), true)

const page = fs.readFileSync('src/app/dashboard/invoices/page.tsx', 'utf8')
eq('sender fejl', page.includes('accountingError={res.accounting_error ?? null}'), true)
eq('sender klar', page.includes('accountingReady={res.accounting_ready}'), true)

const view = fs.readFileSync('src/app/dashboard/invoices/invoices-overview-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="invoice-overview-economic-error"') && view.includes('Det tælles ikke som at e-conomic mangler. Eksport er deaktiveret.'), true)
eq('ikke opsat bliver', view.includes('e-conomic er ikke opsat endnu'), true)
eq('eksport kraever tjek', view.includes('if (accountingError || !canExportAccounting || !accountingReady || selectedExportable.length === 0) return'), true)
eq('knap slaaet fra', view.includes('disabled={!!accountingError || !accountingReady || selectedExportable.length === 0 || bulkPending}'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-overview-economic-load-test OK')
process.exitCode = fail ? 1 : 0
