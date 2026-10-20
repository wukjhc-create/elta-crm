/**
 * Statusmærket på leverandørvarens skrivebord kan krympe. Teksten er uændret.
 *   npx tsx scripts/supplier-product-desktop-status-wrap-test.ts
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
const id = 'data-testid="supplier-product-desktop-status"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 160) : ''
const label = "{product.is_available ? 'Aktiv' : 'Inaktiv'}"
ok(row.includes('break-words min-w-0'), 'mærket kan krympe')
ok(row.includes(label), 'teksten er uændret')
ok((view.match(/\{product\.is_available \? 'Aktiv' : 'Inaktiv'\}/g) ?? []).length === 2, 'to statusser')
ok(view.includes('data-testid="supplier-product-mobile-status"'), 'mobilmærket bliver')
ok(view.includes('font-medium break-words min-w-0">{product.supplier_name}'), 'navnet ombrydes')
ok((view.match(/text-xs text-gray-500">\{product\.manufacturer\}/g) ?? []).length === 1, 'skrivebordsproducenten venter')
ok((view.match(/storedCostText\(product\.cost_price\)/g) ?? []).length === 2, 'kostprisen bliver')
ok((view.match(/storedCostText\(product\.list_price\)/g) ?? []).length === 2, 'listeprisen bliver')
ok((view.match(/storedCostText\(product\.effective_sale_price\)/g) ?? []).length === 2, 'salgsprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-status-wrap-test')
