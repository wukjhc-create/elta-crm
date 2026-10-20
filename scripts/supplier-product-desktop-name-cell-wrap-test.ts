/**
 * Navnecellen paa leverandoervarens skrivebord kan krympe.
 * Navnet, priser og status bliver.
 *   npx tsx scripts/supplier-product-desktop-name-cell-wrap-test.ts
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

const wrapped = '<TableCell className="break-words min-w-0">'
const bare = '<TableCell>'
const name = '<p className="font-medium break-words min-w-0">{product.supplier_name}</p>'
const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')
const at = view.indexOf(name)
const row = at >= 0 ? view.slice(at - 160, at + name.length) : ''

ok(view.includes(wrapped), 'navnecellen kan krympe')
const nameCells = view.split(/\r?\n/).filter((line, i, all) => line.trim() === '<TableCell className="break-words min-w-0">' && (all[i + 1] ?? '').includes('<div className="break-words min-w-0">'))
ok(nameCells.length === 1, 'navnecellen er en')
ok(row.includes(wrapped), 'klassen sidder paa navnecellen')
ok(row.includes('<div className="break-words min-w-0">'), 'navnerammen kan krympe')
ok(!row.includes(bare), 'navnecellen er ikke bar')
ok(view.includes(name), 'navnet bliver')
ok(view.includes('storedCostText(product.cost_price)'), 'kostprisen bliver')
ok(view.includes('storedCostText(product.list_price)'), 'listeprisen bliver')
ok(view.includes('storedCostText(product.effective_sale_price)'), 'salgsprisen bliver')
ok(view.includes("{product.is_available ? 'Aktiv' : 'Inaktiv'}"), 'statussen bliver')
const lines = view.split(/\r?\n/)
const cat = lines.findIndex((line, i) => line.includes('{product.category && (') && lines[i - 1]?.trim() === '<TableCell className="break-words min-w-0">')
ok(cat > 0, 'kategoricellen kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-name-cell-wrap-test')
