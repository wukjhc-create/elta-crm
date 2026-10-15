/** Tilbuddets grossistresultat ombryder netto og salg. formatCurrency og billigste bliver. Koer: npx tsx scripts/offer-supplier-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('const cheapestCost = Math.min')
const end = src.indexOf('handleAddSupplierProduct', start)
const row = src.slice(start, end)
eq('raekken findes', start > 0 && end > start, true)
eq('netto kan krympe', row.includes('text-right min-w-0') && row.split('text-right min-w-0').length === 3, true)
eq('netto ombrydes', row.includes('text-sm font-medium break-words'), true)
eq('salg ombrydes', row.includes('text-sm font-semibold text-green-700 break-words'), true)
eq('ikke shrink-0', row.includes('text-right shrink-0'), false)
eq('netto bliver', row.includes('formatCurrency(p.cost_price, currency, 2)'), true)
eq('salg bliver', row.includes('formatCurrency(p.estimated_sale_price, currency, 2)'), true)
eq('billigste bliver', row.includes('const cheapestCost = Math.min'), true)
eq('kost-gate bliver', row.includes('showFinancials &&'), true)
eq('varenavn ombrydes', row.includes('text-sm font-medium text-gray-900 break-words'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\noffer-supplier-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
