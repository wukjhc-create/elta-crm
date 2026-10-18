/**
 * Null salgspris på leverandørvaren siger at prisen mangler. 0 kr er lagret.
 *   npx tsx scripts/supplier-sale-price-missing-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { storedCostText } from '../src/lib/products/stored-cost-text'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(storedCostText(null) === 'Ingen lagret pris', 'null salgspris mangler')
ok(storedCostText(undefined) === 'Ingen lagret pris', 'udefineret salgspris mangler')
ok(storedCostText(0) !== 'Ingen lagret pris' && storedCostText(0).includes('0'), 'nul er lagret nul')

const table = readFileSync(join('src', 'components', 'modules', 'suppliers', 'supplier-products-table.tsx'), 'utf8')
ok((table.match(/storedCostText\(product\.effective_sale_price\)/g) ?? []).length === 2, 'mobil og tabel bruger teksten')
ok(!table.includes('formatCurrency(product.effective_sale_price)'), 'salgsprisen opfindes ikke')
ok(!table.includes("product.effective_sale_price !== null ? formatCurrency"), 'null er ikke en bindestreg')
ok((table.match(/storedCostText\(product\.list_price\)/g) ?? []).length === 2, 'listeprisen er uændret')
ok((table.match(/storedCostText\(product\.cost_price\)/g) ?? []).length === 2, 'kostteksten er uændret')
ok(!table.includes('formatCurrency'), 'tabellen opfinder ikke et beløb')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-sale-price-missing-test')
