/**
 * Kolonnen Salgspris på leverandørvarens skrivebord kan krympe. Teksten er uændret.
 *   npx tsx scripts/supplier-product-sale-header-wrap-test.ts
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
ok(storedCostText(null) === 'Ingen lagret pris', 'tom salgspris siger det')
ok(storedCostText(Number.NaN) === 'Ingen lagret pris', 'ugyldig salgspris siger det')

const wrapped = '<TableHead className="w-[100px] text-right break-words min-w-0">Salgspris</TableHead>'
const bare = '<TableHead className="w-[100px] text-right">Salgspris</TableHead>'
const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8')

ok(view.includes(wrapped), 'salgspriskolonnen kan krympe')
ok(view.split(wrapped).length === 2, 'salgspriskolonnen er en')
ok(!view.includes(bare), 'salgspriskolonnen er ikke bar')
ok(view.includes('<TableHead className="w-[100px] text-right break-words min-w-0">Listepris</TableHead>'), 'listepriskolonnen bliver')
ok(view.includes('{storedCostText(product.effective_sale_price)}'), 'salgspristeksten bliver')
ok(view.includes('formatCurrency') === false, 'tabellen opfinder ikke en pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-sale-header-wrap-test')
