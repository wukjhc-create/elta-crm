/** Grossistsoegningens kost og salg ombrydes. toLocaleString og billigste bliver. Koer: npx tsx scripts/supplier-search-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/supplier/supplier-product-search.tsx', 'utf8')
eq('pris kan krympe', src.includes('text-right min-w-0'), true)
eq('kost ombrydes', src.includes('text-sm font-semibold break-words'), true)
eq('salg ombrydes', src.includes('text-xs text-green-600 break-words'), true)
eq('ikke shrink-0', src.includes('text-right shrink-0'), false)
eq('kost bliver', src.includes('product.cost_price.toLocaleString'), true)
eq('salg bliver', src.includes('product.estimated_sale_price.toLocaleString'), true)
eq('billigst bliver', src.includes('product.is_cheapest'), true)
eq('varenavn bliver', src.includes('font-medium break-words text-sm min-w-0">{product.product_name}'), true)
eq('sku bliver', src.includes('font-mono break-all">{product.supplier_sku}'), true)
eq('klipper ikke', src.includes('truncate'), false)
eq('tom soegning bliver', src.includes('Ingen produkter fundet for'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nsupplier-search-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
