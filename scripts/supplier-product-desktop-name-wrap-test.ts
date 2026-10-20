/**
 * Leverandørvarens navn på skrivebordet ombrydes. Priser og status er uændrede.
 *   npx tsx scripts/supplier-product-desktop-name-wrap-test.ts
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
const wrapped = 'font-medium break-words min-w-0">{product.supplier_name}'
const mobileName = 'font-medium break-words">{product.supplier_name}'

ok(desk.includes(wrapped), 'skrivebordsnavnet ombrydes')
ok(desk.split(wrapped).length === 2, 'skrivebordsnavnet er et')
ok(!desk.includes('line-clamp-1'), 'skrivebordet klipper ikke navnet')
ok(mobile.includes(mobileName), 'mobilnavnet bliver')
ok(!mobile.includes(wrapped), 'mobilnavnet er ikke skrivebordets')
ok(!view.includes('line-clamp-1'), 'line-clamp-1 er vaek')
ok(desk.includes('text-xs text-gray-500">{product.manufacturer}'), 'producenten bliver')
ok(desk.includes("{product.is_available ? 'Aktiv' : 'Inaktiv'}"), 'statussen bliver')
ok(desk.includes('storedCostText(product.cost_price)'), 'kostprisen bliver')
ok(desk.includes('storedCostText(product.list_price)'), 'listeprisen bliver')
ok(desk.includes('storedCostText(product.effective_sale_price)'), 'salgsprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-name-wrap-test')
