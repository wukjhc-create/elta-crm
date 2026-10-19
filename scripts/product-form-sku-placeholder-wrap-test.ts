/**
 * Pladsholderen på SKU ombrydes. Teksten F.eks. JA400-MONO er uændret.
 *   npx tsx scripts/product-form-sku-placeholder-wrap-test.ts
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
const at = view.indexOf('data-testid="product-form-sku"')
const row = at >= 0 ? view.slice(at - 240, at + 40) : ''
ok(row.includes('className="break-words min-w-0"'), 'pladsholderen ombrydes')
ok(row.includes('placeholder="F.eks. JA400-MONO"'), 'teksten er uændret')
ok(row.includes("defaultValue={product?.sku || ''}"), 'sku bliver')
ok(row.includes('id="sku"'), 'feltet bliver')
ok(view.includes('data-testid="product-form-sku-label"'), 'etiketten bliver')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-sku-placeholder-wrap-test')
