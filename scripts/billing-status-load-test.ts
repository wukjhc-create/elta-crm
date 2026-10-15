/** En fejlet faktureringsstatus er ikke intet at fakturere. Status og beloeb bliver. Koer: npx tsx scripts/billing-status-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/actions/service-case-economy.ts', 'utf8')
const start = src.indexOf('export async function getServiceCaseBillingStatus')
const end = src.indexOf('export interface CaseProjectEconomy')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('sagfejl foer ikke-fundet', fn.indexOf("error: 'Kunne ikke hente faktureringsstatus'") < fn.indexOf("error: 'Sag ikke fundet'"), true)
eq('ikke-fundet bliver', fn.includes("error: 'Sag ikke fundet'"), true)
eq('arbejdsordrefejl foer listen', fn.indexOf('if (woErr)') < fn.indexOf('const woIds'), true)
eq('linjefejl foer optaelling', fn.indexOf('if (matRes.error || othRes.error || invRes.error)') < fn.indexOf('summarizeUnbilled'), true)
eq('afviste timer bliver', fn.includes(".neq('approval_status', 'rejected')"), true)
eq('netto bliver', fn.includes('netInvoicedExVat('), true)
eq('rest bliver', fn.includes('remaining_to_invoice: refSum != null ? r2(refSum - invoiced_total) : null'), true)
eq('klar bliver', fn.includes("else if (unbilled > 0) status = 'ready_to_bill'"), true)
eq('intet arbejde bliver', fn.includes("if (!hasWork) status = 'no_work'"), true)
eq('tilladelse bliver', fn.includes("error: 'Manglende tilladelse: invoices.view.own_cases'"), true)

const view = fs.readFileSync('src/components/modules/orders/case-billing-status-card.tsx', 'utf8')
const banner = 'Faktureringsstatus kunne ikke hentes. Det tælles ikke som intet at fakturere.'
eq('banneret siger det', view.includes('data-testid="billing-status-load-error"') && view.includes(banner), true)
eq('succes saetter data', view.includes('if (r.success && r.data) setData(r.data)'), true)
eq('fejl saetter ikke status', view.indexOf('else setLoadError') > view.indexOf('if (r.success && r.data) setData'), true)
eq('aegte tom venter', view.includes('if (!loaded || !data) return null'), true)
eq('intet at fakturere bliver', view.includes('Intet at fakturere endnu'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nbilling-status-load-test OK')
process.exitCode = fail ? 1 : 0
