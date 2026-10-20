/**
 * Kolonnen Listepris på leverandørvarens skrivebord kan krympe. Teksten er uændret.
 *   npx tsx scripts/supplier-product-list-header-wrap-test.ts
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

const wrapped = '<TableHead className="w-[100px] text-right break-words min-w-0">Listepris</TableHead>'
const bare = '<TableHead className="w-[100px] text-right">Listepris</TableHead>'
const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')

ok(view.includes(wrapped), 'listepriskolonnen kan krympe')
ok(view.split(wrapped).length === 2, 'listepriskolonnen er en')
ok(!view.includes(bare), 'listepriskolonnen er ikke bar')
ok(view.includes('<TableHead className="w-[100px] text-right break-words min-w-0">Salgspris</TableHead>'), 'salgspriskolonnen bliver')
ok(!view.includes('<TableHead className="w-[100px] text-right">Salgspris</TableHead>'), 'salgspriskolonnen er ikke bar')
ok(view.includes('{storedCostText(product.list_price)}'), 'listepristeksten bliver')
ok(view.includes('formatCurrency') === false, 'tabellen opfinder ikke en pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-list-header-wrap-test')
