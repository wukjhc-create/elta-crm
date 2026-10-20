/**
 * Navnerammen paa leverandoervarens skrivebord kan krympe.
 * Producent, priser og mobilkortet bliver.
 *   npx tsx scripts/supplier-product-desktop-name-frame-wrap-test.ts
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

const wrapped = '<div className="break-words min-w-0">'
const bare = '<div>'
const name = '<p className="font-medium break-words min-w-0">{product.supplier_name}</p>'
const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')
const at = view.indexOf(name)
const row = at >= 0 ? view.slice(at - 180, at + name.length) : ''

ok(view.includes(wrapped), 'navnerammen kan krympe')
ok(view.split(wrapped).length === 2, 'navnerammen er en')
ok(row.includes(wrapped), 'klassen sidder paa navnerammen')
ok(!row.includes(bare), 'navnerammen er ikke bar')
ok(view.includes(name), 'navnet bliver')
ok(view.includes('<p className="text-xs text-gray-500 break-words min-w-0">{product.manufacturer}</p>'), 'producenten bliver')
ok(view.includes('font-medium break-words">{product.supplier_name}'), 'mobilnavnet bliver')
ok(view.includes('storedCostText(product.cost_price)'), 'kostprisen bliver')
ok(view.includes('storedCostText(product.list_price)'), 'listeprisen bliver')
ok(view.includes('storedCostText(product.effective_sale_price)'), 'salgsprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-name-frame-wrap-test')
