/**
 * Producentnavnet på leverandørvarens skrivebord ombrydes.
 * Priser og mobilkortet bliver.
 *   npx tsx scripts/supplier-product-desktop-manufacturer-wrap-test.ts
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

ok(desk.includes(wrapped), 'skrivebordsproducenten ombrydes')
ok(desk.split(wrapped).length === 2, 'skrivebordsproducenten er en')
ok(!desk.includes(bare), 'skrivebordsproducenten klippes ikke')
ok(mobile.includes(wrapped), 'mobilproducenten bliver ombrudt')
ok(!mobile.includes(bare), 'mobilproducenten klippes ikke')
ok(mobile.split(wrapped).length === 2, 'mobilproducenten er en')
ok(desk.includes('storedCostText(product.cost_price)'), 'kostprisen bliver')
ok(desk.includes('storedCostText(product.list_price)'), 'listeprisen bliver')
ok(desk.includes('storedCostText(product.effective_sale_price)'), 'salgsprisen bliver')
ok(mobile.includes('font-medium break-words">{product.supplier_name}'), 'mobilnavnet bliver')
ok(desk.includes('font-medium break-words min-w-0">{product.supplier_name}'), 'skrivebordsnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-manufacturer-wrap-test')
