/**
 * Varenummeret på leverandørvarens skrivebord kan krympe. Teksten er uændret.
 *   npx tsx scripts/supplier-product-desktop-sku-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')
const id = 'data-testid="supplier-product-desktop-sku"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 120) : ''
ok(row.includes('break-all min-w-0'), 'varenummeret kan krympe')
ok(row.includes('{product.supplier_sku}'), 'teksten er uændret')
ok(view.includes('data-testid="supplier-product-mobile-sku"'), 'mobilkortet bliver')
ok((view.match(/\{product\.supplier_sku\}/g) ?? []).length === 2, 'to varenumre')
ok(view.includes('font-medium break-words min-w-0">{product.supplier_name}'), 'navnet ombrydes')
ok(view.includes('text-xs text-gray-500">{product.manufacturer}'), 'producenten bliver')
ok((view.match(/storedCostText\(product\.cost_price\)/g) ?? []).length === 2, 'kostprisen bliver')
ok((view.match(/storedCostText\(product\.list_price\)/g) ?? []).length === 2, 'listeprisen bliver')
ok((view.match(/storedCostText\(product\.effective_sale_price\)/g) ?? []).length === 2, 'salgsprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-sku-wrap-test')
