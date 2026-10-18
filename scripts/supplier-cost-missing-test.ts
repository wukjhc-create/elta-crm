/**
 * Null kost på leverandørvaren siger at prisen mangler. 0 kr er lagret.
 *   npx tsx scripts/supplier-cost-missing-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { storedCostText } from '../src/lib/products/stored-cost-text'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(storedCostText(null) === 'Ingen lagret pris', 'null mangler')
ok(storedCostText(undefined) === 'Ingen lagret pris', 'udefineret mangler')
ok(storedCostText(Number.NaN) === 'Ingen lagret pris', 'NaN mangler')
ok(storedCostText(0) !== 'Ingen lagret pris' && storedCostText(0).includes('0'), 'nul er lagret nul')

const table = readFileSync(join('src', 'components', 'modules', 'suppliers', 'supplier-products-table.tsx'), 'utf8')
ok((table.match(/storedCostText\(product\.cost_price\)/g) ?? []).length === 2, 'mobil og tabel bruger teksten')
ok((table.match(/storedCostText\(product\.list_price\)/g) ?? []).length === 2, 'listepris bruger samme lagrede tekst')
ok(table.includes('formatCurrency(product.effective_sale_price)'), 'salgsprisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-cost-missing-test')
