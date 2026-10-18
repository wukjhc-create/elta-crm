/**
 * Produktbeskrivelsen på katalogets mobilkort ombrydes. Navn og priser er uændret.
 *   npx tsx scripts/product-description-mobile-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'products', 'products-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="product-description-mobile"')
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'mobilbeskrivelsen ombrydes')
ok(row.includes('{product.description}'), 'teksten er uændret')
ok(!view.includes('line-clamp'), 'beskrivelserne klippes ikke')
ok(view.includes('data-testid="product-description"'), 'skrivebordet bliver')
ok(view.split('formatCurrency(product.list_price)').length - 1 === 2, 'listeprisen bliver')
ok(view.includes('storedCostText(product.cost_price)'), 'kostprisen bliver')
ok(view.split('hover:text-blue-600 break-words').length - 1 === 2, 'navnelinket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-description-mobile-wrap-test')
