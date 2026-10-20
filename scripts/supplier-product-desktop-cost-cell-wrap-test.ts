/**
 * Kostcellen på leverandørvarens skrivebord kan krympe.
 * Listepris, salgspris og lagret tekst er uændrede.
 *   npx tsx scripts/supplier-product-desktop-cost-cell-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { storedCostText } from '../src/lib/products/stored-cost-text'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')
ok(storedCostText(0) === formatCurrency(0), 'nul er en lagret pris')
ok(storedCostText(null) === 'Ingen lagret pris', 'tom kost siger det')

const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')
const lines = view.split(/\r?\n/)
const wrapped = '<TableCell className="text-right font-mono text-sm break-words min-w-0">'
const bare = '<TableCell className="text-right font-mono text-sm">'
const sale = '<TableCell className="text-right font-mono text-sm text-blue-600">'
const costLine = lines.findIndex((line) => line.trim() === '{storedCostText(product.cost_price)}')
const listLine = lines.findIndex((line) => line.trim() === '{storedCostText(product.list_price)}')
const saleLine = lines.findIndex((line) => line.trim() === '{storedCostText(product.effective_sale_price)}')

ok(lines[costLine - 1]?.trim() === wrapped, 'kostcellen kan krympe')
ok(lines.filter((line, i) => line.trim() === '{storedCostText(product.cost_price)}' && lines[i - 1]?.trim() === wrapped).length === 1, 'kostcellen er en')
ok(lines[costLine - 1]?.trim() !== bare, 'kostcellen er ikke bar')
ok(lines[listLine - 1]?.trim() === wrapped, 'listeprisen kan krympe')
ok(lines[listLine - 1]?.trim() !== bare, 'listeprisen er ikke bar')
ok(lines[saleLine - 1]?.trim() === '<TableCell className="text-right font-mono text-sm text-blue-600 break-words min-w-0">', 'salgsprisen kan krympe')
ok(lines[saleLine - 1]?.trim() !== sale, 'salgsprisen er ikke bar')
ok(view.includes('<dd className="font-mono break-words">{storedCostText(product.cost_price)}</dd>'), 'mobilkost bliver')
ok((view.match(/storedCostText\(product\.cost_price\)/g) ?? []).length === 2, 'kostteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-cost-cell-wrap-test')
