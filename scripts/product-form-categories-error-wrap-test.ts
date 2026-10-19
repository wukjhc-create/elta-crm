/**
 * Fejlteksten i produktformularen når kategorierne ikke kan hentes ombrydes.
 * Sætningen er uændret.
 *   npx tsx scripts/product-form-categories-error-wrap-test.ts
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
const at = view.indexOf('data-testid="product-form-categories-error"')
const row = at >= 0 ? view.slice(at - 80, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'fejlteksten ombrydes')
ok(row.includes('{categoriesError}. Det tælles ikke som ingen kategorier.'), 'sætningen er uændret')
ok(view.includes('data-testid="product-form-category-label"'), 'kategori-etiketten bliver')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-categories-error-wrap-test')
