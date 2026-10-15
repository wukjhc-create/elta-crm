/** Grossistsøgning ombryder varenavn og SKU. Kost og salg vises som før. Koer: npx tsx scripts/supplier-search-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/supplier/supplier-product-search.tsx', 'utf8')

eq('varenavn ombrydes', src.includes('font-medium break-words text-sm min-w-0">{product.product_name}'), true)
eq('varenavn klippes ikke', src.includes('font-medium truncate text-sm'), false)
eq('sku ombrydes', src.includes('font-mono break-all">{product.supplier_sku}'), true)
eq('kost bliver', src.includes('product.cost_price.toLocaleString'), true)
eq('salg bliver', src.includes('product.estimated_sale_price.toLocaleString'), true)
eq('billigst bliver', src.includes('product.is_cheapest'), true)
eq('tom soegning bliver', src.includes('Ingen produkter fundet for'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-search-name-test OK')
process.exitCode = fail ? 1 : 0
