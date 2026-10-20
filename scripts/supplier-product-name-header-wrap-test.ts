/**
 * Navnerækken i leverandørvarens kolonne kan krympe. Teksten og sorteringen er uændrede.
 *   npx tsx scripts/supplier-product-name-header-wrap-test.ts
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
ok(storedCostText(null) === 'Ingen lagret pris', 'tom pris bliver')
ok(storedCostText(Number.NaN) === 'Ingen lagret pris', 'ugyldig pris bliver')

const wrapped = '<div className="flex items-center gap-1 break-words min-w-0">\n                      Navn'
const bare = '<div className="flex items-center gap-1">\n                      Navn'
const view = readFileSync('src/components/modules/suppliers/supplier-products-table.tsx', 'utf8').replace(/\r\n/g, '\n')

ok(view.includes(wrapped), 'navneraekken kan krympe')
ok(view.split(wrapped).length === 2, 'navneraekken er en')
ok(!view.includes(bare), 'navneraekken er ikke bar')
ok(view.includes('<div className="flex items-center gap-1">\n                      Varenummer'), 'varenummerraekken bliver')
ok(view.includes('<div className="flex items-center gap-1">\n                      Kategori'), 'kategoriraekken bliver')
ok(view.includes('<div className="flex items-center gap-1">\n                      Opdateret'), 'opdateret-raekken bliver')
ok(view.includes('column="supplier_name"'), 'sorteringen bliver')
ok(view.includes("import { storedCostText } from '@/lib/products/stored-cost-text'"), 'kostteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  supplier-product-name-header-wrap-test')
