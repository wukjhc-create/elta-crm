/**
 * Producentnavnet på leverandørvarens mobilkort ombrydes.
 * Priser, varenummer og status er uændrede.
 *   npx tsx scripts/supplier-product-mobile-manufacturer-wrap-test.ts
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

const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')
const mobileAt = view.indexOf('data-testid="supplier-products-mobile"')
const deskAt = view.indexOf('hidden md:block bg-white rounded-lg border overflow-hidden overflow-x-auto')
const mobile = mobileAt >= 0 && deskAt > mobileAt ? view.slice(mobileAt, deskAt) : ''
const desk = deskAt >= 0 ? view.slice(deskAt) : ''
const wrapped = 'text-xs text-gray-500 break-words min-w-0">{product.manufacturer}'
const bare = 'text-xs text-gray-500">{product.manufacturer}'

ok(mobile.includes(wrapped), 'mobilproducenten ombrydes')
ok(mobile.split(wrapped).length === 2, 'mobilproducenten er en')
ok(!mobile.includes(bare), 'mobilproducenten klippes ikke')
ok(desk.includes(bare), 'skrivebordsproducenten bliver')
ok(!desk.includes(wrapped), 'skrivebordet er ikke pakket')
ok(mobile.includes('data-testid="supplier-product-mobile-sku"'), 'varenummeret bliver')
ok(mobile.includes("{product.is_available ? 'Aktiv' : 'Inaktiv'}"), 'statussen bliver')
ok(mobile.includes('storedCostText(product.cost_price)'), 'kostprisen bliver')
ok(mobile.includes('storedCostText(product.list_price)'), 'listeprisen bliver')
ok(mobile.includes('storedCostText(product.effective_sale_price)'), 'salgsprisen bliver')
ok(mobile.includes('font-medium break-words">{product.supplier_name}'), 'mobilnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-mobile-manufacturer-wrap-test')
