/** En fejlet laesning af afsluttede sager er ikke 0 fakturahandlinger. Taellere og cap bliver. Koer: npx tsx scripts/billing-followup-closed-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/actions/service-case-economy.ts', 'utf8')
const start = src.indexOf('export async function getBillingFollowupSummaryAction')
const end = src.indexOf('export interface CasePurchaseSupplierBreakdown')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl foer raekker', fn.indexOf('if (closedErr)') < fn.indexOf('addRows((closedRows'), true)
eq('fejltekst', fn.includes("error: 'Kunne ikke hente faktureringsopfølgning'"), true)
eq('cap bliver', fn.includes('BILLING_FOLLOWUP_CAP'), true)
eq('over bliver', fn.includes('over_invoiced: over'), true)
eq('klar bliver', fn.includes('ready_final: ready'), true)
eq('sum bliver', fn.includes('total_action: over + ready + outstanding'), true)
eq('filter bliver', fn.includes('caseMatchesBillingFilter(entry, meta.status'), true)

const view = fs.readFileSync('src/components/modules/dashboard/billing-followup-widget.tsx', 'utf8')
eq('widget siger ikke 0', view.includes('Det tælles ikke som 0 sager.'), true)
eq('groen tom bliver', view.includes('Ingen sager kræver fakturahandling lige nu.'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nbilling-followup-closed-test OK')
process.exitCode = fail ? 1 : 0
