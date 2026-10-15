/** Tilbuddets produktvaelger siger naar listen ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/offer-products-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('const handleOpenProductPicker')
const fn = src.slice(start, src.indexOf('const handleOpenCalculationPicker', start))
eq('funktionen findes', start > 0, true)
eq('success saetter listen', fn.includes('setProducts(result.data)'), true)
eq('success rydder fejl', fn.includes('setProductsError(null)'), true)
eq('fejl teksten', fn.includes("setProductsError(result.error || 'Kunne ikke hente produkter')"), true)
eq('fejl toemmer ikke listen', fn.includes('setProducts([])') === false, true)
eq('tilfoej bliver', src.includes('addProductToOffer(offer.id, productId, 1)'), true)
eq('pris bliver', src.includes('formatCurrency(product.list_price, currency, 2)'), true)
eq('banner', src.includes('data-testid="offer-products-load-error"') && src.includes('Det tælles ikke som ingen produkter.'), true)
eq('allerede hentede bliver', src.includes('Allerede hentede produkter bliver.'), true)
eq('aegte tom kraever ingen fejl', src.includes('!productsError && products.length === 0'), true)
eq('aegte tom bliver', src.includes('Ingen produkter fundet'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-products-load-test OK')
process.exitCode = fail ? 1 : 0
