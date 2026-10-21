/** En fejlet projektokonomi er ikke 0 kr. Rest-formlen og kortets fejltekst bliver. Koer: npx tsx scripts/project-economy-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/actions/service-case-economy.ts', 'utf8')
const start = src.indexOf('export async function getServiceCaseProjectEconomy')
const end = src.indexOf('export interface CaseEconomyBatchEntry')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('sagfejl foer ikke-fundet', fn.indexOf("error: 'Kunne ikke hente projektøkonomi'") < fn.indexOf("error: 'Sag ikke fundet'"), true)
eq('ikke-fundet bliver', fn.includes("error: 'Sag ikke fundet'"), true)
eq('fakturafejl foer raekker', fn.indexOf('if (invErr)') < fn.indexOf('const rows'), true)
eq('rest bliver', fn.includes('remaining_to_invoice: refSum != null ? r2(refSum - sum.netExVat) : null'), true)
eq('summering bliver', fn.includes('summarizeCaseInvoices(rows as unknown as CaseInvoiceRow[])'), true)
eq('udstedte bliver', fn.includes("const ISSUED = new Set(['sent', 'paid'])"), true)
eq('tilladelse bliver', fn.includes("error: 'Manglende tilladelse: invoices.view.own_cases'"), true)

const view = fs.readFileSync('src/components/modules/orders/case-project-economy-card.tsx', 'utf8')
eq('kortet siger ikke 0', view.includes('data-testid="project-economy-load-error"') && view.includes('Det tælles ikke som 0 kr.'), true)
eq('fejl saetter ikke data', view.includes('if (r.success && r.data) setData(r.data); else setError'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nproject-economy-load-test OK')
process.exitCode = fail ? 1 : 0
