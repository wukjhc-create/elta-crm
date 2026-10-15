/** Grossistsogning: fejl er ikke "ingen produkter" og ikke den forrige liste. Koer: npx tsx scripts/supplier-search-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/supplier/supplier-product-search.tsx', 'utf8')
const start = src.indexOf('const doSearch')
const end = src.indexOf('const handleInputChange')
const search = src.slice(start, end)

eq('kort soegning rydder', search.includes('searchQuery.length < 2') && search.includes('setSearchError(null)') && search.includes('setShowResults(false)'), true)
eq('gammelt svar ignoreres', search.includes('if (seq !== searchSeq.current) return'), true)
eq('fejl rydder raekker', search.includes('setResults([])') && search.includes("setSearchError(result.success ? null : (result.error || 'Kunne ikke søge produkter'))"), true)
eq('kast rydder raekker', search.includes("setSearchError('Kunne ikke søge produkter')"), true)
eq('fejlen siges', src.includes('data-testid="supplier-search-load-error"') && src.includes('Det tælles ikke som ingen produkter.'), true)
eq('aegte tom liste bliver', src.includes('!searchError && query.length >= 2') && src.includes('Ingen produkter fundet for'), true)
eq('kost bliver', src.includes('product.cost_price.toLocaleString'), true)
eq('salg bliver', src.includes('product.estimated_sale_price.toLocaleString'), true)
eq('billigst bliver', src.includes('product.is_cheapest'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-search-load-test OK')
process.exitCode = fail ? 1 : 0
