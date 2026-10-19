/**
 * Pladsholderen Alle kategorier i kategori-vælgeren ombrydes. Ordene er uændrede.
 *   npx tsx scripts/product-category-placeholder-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'products', 'products-client.tsx'), 'utf8')
const call = '<SelectValue placeholder="Alle kategorier" className="break-words min-w-0" />'
ok(view.includes(call), 'pladsholderen ombrydes')
ok(view.includes('value={categoryId || \'all\'}'), 'value bliver')
ok(view.includes('onValueChange='), 'skiftet bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')

const select = readFileSync(join('src', 'components', 'ui', 'select.tsx'), 'utf8')
ok(select.includes('{placeholder}'), 'ordene kommer fra pladsholderen')
ok(select.includes("clsx(context.value ? '' : 'text-gray-400', className)"), 'klassen lander paa span')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-category-placeholder-wrap-test')
