/** Grossist-API-soegning har navne og et mobilkort. Priser og import bliver. Koer: npx tsx scripts/supplier-api-search-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/supplier-api-search.tsx', 'utf8')
const marker = 'data-testid="supplier-api-search-mobile"'
const at = src.indexOf(marker)
const mobile = src.slice(Math.max(0, at - 80), src.indexOf('hidden md:block', at))
const desk = src.slice(src.indexOf('hidden md:block', at))

eq('mobilkort findes', at > 0 && mobile.includes('md:hidden'), true)
eq('sku ombrydes', mobile.includes('break-all">{product.sku}'), true)
eq('navn ombrydes', mobile.includes('break-words">{product.name}'), true)
eq('kost bliver', mobile.includes('formatCurrency(product.costPrice'), true)
eq('listepris bliver', mobile.includes('formatCurrency(product.listPrice'), true)
eq('vaelg har et navn', mobile.includes('aria-label={`Vælg ${product.sku}`}'), true)
eq('opdater har et navn', mobile.includes('aria-label={`Opdater pris ${product.sku}`}'), true)
eq('sammenlign har et navn', mobile.includes('aria-label={`Sammenlign priser ${product.name}`}'), true)
eq('desktop vaelg alle', desk.includes('aria-label="Vælg alle"'), true)
eq('soegning har et navn', src.includes('aria-label="Søg i leverandørens katalog"'), true)
eq('import bliver', src.includes('importProductsFromAPI(supplierId, productsToImport)'), true)
eq('tom soegning bliver', src.includes('Ingen produkter fundet for'), true)
eq('live pris bliver', src.includes('getLiveProductPrice(supplierId, sku)'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-api-search-mobile-test OK')
process.exitCode = fail ? 1 : 0
