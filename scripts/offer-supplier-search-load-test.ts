/** Tilbuddets leverandoersoegning: fejl er ikke "ingen produkter". Priserne bliver. Koer: npx tsx scripts/offer-supplier-search-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('const handleSupplierSearch')
const end = src.indexOf('const handleAddSupplierProduct')
const search = src.slice(start, end)

eq('kort soegning rydder', search.includes('query.length < 2') && search.includes('setSupplierSearchError(null)'), true)
eq('gammelt svar ignoreres', search.includes('if (seq !== supplierSearchSeq.current) return'), true)
eq('fejl rydder raekker', search.includes('setSupplierSearchResults([])') && search.includes("setSupplierSearchError(result.success ? null : (result.error || 'Kunne ikke søge produkter'))"), true)
eq('kast rydder raekker', search.includes("setSupplierSearchError('Kunne ikke søge produkter')"), true)
eq('loft bliver', search.includes('limit: 15'), true)
eq('fejlen siges', src.includes('data-testid="offer-supplier-search-error"') && src.includes('Det tælles ikke som ingen produkter.'), true)
eq('aegte tom liste bliver', src.includes('!supplierSearchError && supplierSearchQuery.length >= 2') && src.includes('Prøv et andet varenummer eller navn.'), true)
eq('billigste bliver', src.includes('const cheapestCost = Math.min(...supplierSearchResults.filter(p => p.cost_price > 0).map(p => p.cost_price))'), true)
eq('kost og salg bliver', src.includes('formatCurrency(p.cost_price, currency, 2)') && src.includes('formatCurrency(p.estimated_sale_price, currency, 2)'), true)
eq('tilfoej bliver', src.includes('handleAddSupplierProduct(p.id)'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-supplier-search-load-test OK')
process.exitCode = fail ? 1 : 0
