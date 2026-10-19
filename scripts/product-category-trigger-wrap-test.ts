/**
 * Kategori-vælgerens etiket ombrydes. aria-label Kategori er uændret.
 *   npx tsx scripts/product-category-trigger-wrap-test.ts
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
const at = view.indexOf('aria-label="Kategori"')
const row = at >= 0 ? view.slice(at - 120, at + 30) : ''
ok(row.includes('className="w-full sm:w-[200px] break-words min-w-0"'), 'etiketten ombrydes')
ok(row.includes('aria-label="Kategori"'), 'etiketten er uændret')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(view.includes('data-testid="product-category-option"'), 'kategorinavnet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

const select = readFileSync(join('src', 'components', 'ui', 'select.tsx'), 'utf8')
ok(select.includes('aria-label={ariaLabel}'), 'navnet sendes videre')
ok(select.includes('onClick={() => setOpen(!open)}'), 'aabn og luk bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-category-trigger-wrap-test')
