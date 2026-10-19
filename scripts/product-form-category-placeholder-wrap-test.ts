/**
 * Pladsholderen Vælg kategori i produktformularen ombrydes. Ordene er uændrede.
 *   npx tsx scripts/product-form-category-placeholder-wrap-test.ts
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

const view = readFileSync(join('src', 'components', 'modules', 'products', 'product-form.tsx'), 'utf8')
const call = '<SelectValue placeholder="Vælg kategori" className="break-words min-w-0" />'
ok(view.includes(call), 'pladsholderen ombrydes')
ok(view.includes("defaultValue={product?.category_id || ''}"), 'kategorien bliver')
ok(view.includes('<SelectValue />'), 'enhedens pladsholder bliver')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

const select = readFileSync(join('src', 'components', 'ui', 'select.tsx'), 'utf8')
ok(select.includes('{placeholder}'), 'ordene kommer fra pladsholderen')
ok(select.includes("clsx(context.value ? '' : 'text-gray-400', className)"), 'klassen lander paa span')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-category-placeholder-wrap-test')
