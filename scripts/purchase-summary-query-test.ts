/** En fejlet indkoebslaesning er ikke 0 kr. Summer og budget-raekkefoelge bliver. Koer: npx tsx scripts/purchase-summary-query-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/actions/service-case-economy.ts', 'utf8')
const start = src.indexOf('export async function getServiceCasePurchaseSummary')
const end = src.indexOf('export interface UnconvertedSupplierInvoice')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl foer summer', fn.indexOf('if (matRes.error || othRes.error || sagRes.error || invRes.error)') < fn.indexOf('const matRows'), true)
eq('fejl er ikke ok', fn.includes("return { ...base, message: 'Kunne ikke hente indkøbsoverblik' }"), true)
eq('succes kommer efter', fn.indexOf('ok: true') > fn.indexOf('if (matRes.error'), true)
eq('materialesum bliver', fn.includes('s + Number(r.total_cost ?? 0)'), true)
eq('budget foerst', fn.indexOf('if (sag?.budget != null)') < fn.indexOf('sag?.revised_sum'), true)
eq('tilladelse bliver', fn.includes("message: 'Manglende tilladelse: economy.cost_prices'"), true)

const view = fs.readFileSync('src/components/modules/orders/case-purchase-summary-card.tsx', 'utf8')
eq('kortet siger ikke 0', view.includes('Det tælles ikke som 0 kr.'), true)
eq('aegte tom bliver', view.includes('Ingen leverandørfaktura-linjer konverteret til denne sag endnu.'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\npurchase-summary-query-test OK')
process.exitCode = fail ? 1 : 0
