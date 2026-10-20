/**
 * Mobilkortet for en leverandoervare kan krympe. Priser, navn og status bliver.
 *   npx tsx scripts/supplier-product-mobile-card-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const wrapped = '<article key={product.id} className="rounded-lg border bg-white p-3 space-y-2 text-sm break-words min-w-0">'
const bare = '<article key={product.id} className="rounded-lg border bg-white p-3 space-y-2 text-sm">'
const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')

ok(view.includes(wrapped), 'mobilkortet kan krympe')
ok(view.split(wrapped).length === 2, 'mobilkortet er et')
ok(!view.includes(bare), 'mobilkortet er ikke bart')
ok(view.includes('font-medium break-words">{product.supplier_name}'), 'mobilnavnet bliver')
ok(view.includes('storedCostText(product.cost_price)'), 'kostprisen bliver')
ok(view.includes('storedCostText(product.list_price)'), 'listeprisen bliver')
ok(view.includes('storedCostText(product.effective_sale_price)'), 'salgsprisen bliver')
ok(view.includes('data-testid="supplier-product-mobile-status"'), 'statussen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-mobile-card-wrap-test')
