/** Kundeprisopslag: fejl er ikke "ingen priser". Belob og bedste pris bliver. Koer: npx tsx scripts/customer-price-lookup-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-pricing.tsx', 'utf8')
const start = src.indexOf('const handlePriceLookup')
const end = src.indexOf('const handleFormSuccess')
const lookup = src.slice(start, end)

eq('tom sku bliver', lookup.includes('if (!sku) return'), true)
eq('gammelt opslag ignoreres', lookup.includes('if (seq !== priceLookupSeq.current) return'), true)
eq('fejl rydder priser', lookup.includes('setPriceResults([])') && lookup.includes("setPriceLookupError(result.error || 'Kunne ikke slå prisen op')"), true)
eq('aegte tom liste rydder fejl', lookup.includes('setPriceLookupError(null)'), true)
eq('kast rydder priser', lookup.includes("setPriceLookupError('Kunne ikke slå prisen op')"), true)
eq('fejlen siges', src.includes('data-testid="customer-price-lookup-error"') && src.includes('Det tælles ikke som ingen priser.'), true)
eq('aegte tom liste bliver', src.includes('!priceLookupError && priceResults.length === 0') && src.includes('Ingen priser fundet for'), true)
eq('bedste pris bliver', src.includes('Bedste pris'), true)
eq('salg bliver', src.includes('r.effective_sale_price'), true)
eq('kost bliver', src.includes('r.effective_cost_price'), true)
eq('rabat bliver', src.includes('r.discount_percentage > 0'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-price-lookup-test OK')
process.exitCode = fail ? 1 : 0
