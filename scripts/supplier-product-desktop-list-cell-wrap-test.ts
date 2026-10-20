/**
 * Listepriscellen på leverandørvarens skrivebord kan krympe.
 * Kostpris, salgspris og lagret tekst er uændrede.
 *   npx tsx scripts/supplier-product-desktop-list-cell-wrap-test.ts
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
ok(storedCostText(null) === 'Ingen lagret pris', 'tom listepris siger det')
ok(storedCostText(Number.NaN) === 'Ingen lagret pris', 'ugyldig listepris siger det')

const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')
const lines = view.split(/\r?\n/)
const wrapped = '<TableCell className="text-right font-mono text-sm break-words min-w-0">'
const bare = '<TableCell className="text-right font-mono text-sm">'
const sale = '<TableCell className="text-right font-mono text-sm text-blue-600">'
const costLine = lines.findIndex((line) => line.trim() === '{storedCostText(product.cost_price)}')
const listLine = lines.findIndex((line) => line.trim() === '{storedCostText(product.list_price)}')
const saleLine = lines.findIndex((line) => line.trim() === '{storedCostText(product.effective_sale_price)}')

ok(lines[listLine - 1]?.trim() === wrapped, 'listepriscellen kan krympe')
ok(
  lines.filter((line, i) => line.trim() === '{storedCostText(product.list_price)}' && lines[i - 1]?.trim() === wrapped).length === 1,
  'listepriscellen er en',
)
ok(lines[listLine - 1]?.trim() !== bare, 'listepriscellen er ikke bar')
ok(!view.includes(bare), 'den bare klasse er vaek')
ok(lines[costLine - 1]?.trim() === wrapped, 'kostcellen bliver')
ok(lines[saleLine - 1]?.trim() === sale, 'salgsprisen bliver')
ok(view.includes('<dd className="font-mono break-words">{storedCostText(product.list_price)}</dd>'), 'mobillistepris bliver')
ok((view.match(/storedCostText\(product\.list_price\)/g) ?? []).length === 2, 'listepristeksten bliver')
ok(view.includes('<TableHead className="w-[100px] text-right">Listepris</TableHead>'), 'kolonnen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-desktop-list-cell-wrap-test')
