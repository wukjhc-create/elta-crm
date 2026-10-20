/**
 * Statuscellen på leverandørvarens skrivebord kan krympe.
 * Mærket, priser og navn er uændrede.
 *   npx tsx scripts/supplier-product-desktop-status-cell-wrap-test.ts
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
const lines = view.split(/\r?\n/)
const id = 'data-testid="supplier-product-desktop-status"'
const wrapped = lines.findIndex((line, i) => line.includes(id) && lines[i - 1]?.trim() === '<TableCell className="break-words min-w-0">')
const bare = lines.findIndex((line, i) => line.includes(id) && lines[i - 1]?.trim() === '<TableCell>')
ok(wrapped > 0, 'statuscellen kan krympe')
ok(lines.filter((line, i) => line.includes(id) && lines[i - 1]?.trim() === '<TableCell className="break-words min-w-0">').length === 1, 'statuscellen er en')
ok(bare < 0, 'statuscellen er ikke bar')
ok(view.includes('className="break-words min-w-0 max-w-full" data-testid="supplier-product-desktop-status"'), 'maerket bliver')
ok(view.includes("{product.is_available ? 'Aktiv' : 'Inaktiv'}"), 'teksten bliver')
ok(view.includes('data-testid="supplier-product-desktop-category"'), 'kategorien bliver')
ok(view.includes('<p className="font-medium break-words min-w-0">{product.supplier_name}</p>'), 'navnet bliver')
ok((view.match(/storedCostText\(product\.cost_price\)/g) ?? []).length === 2, 'kostprisen bliver')
ok((view.match(/storedCostText\(product\.list_price\)/g) ?? []).length === 2, 'listeprisen bliver')
ok((view.match(/storedCostText\(product\.effective_sale_price\)/g) ?? []).length === 2, 'salgsprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-status-cell-wrap-test')
