/**
 * Enhedsvælgeren i produktformularen ombrydes. defaultValue er uændret.
 *   npx tsx scripts/product-form-unit-trigger-wrap-test.ts
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
const at = view.indexOf("defaultValue={product?.unit || 'stk'}")
const row = at >= 0 ? view.slice(at, at + 240) : ''
ok(row.includes('<SelectTrigger className="break-words min-w-0">'), 'vaelgeren ombrydes')
ok(row.includes("defaultValue={product?.unit || 'stk'}"), 'vaerdien er uændret')
ok(row.includes('<SelectValue />'), 'pladsholderen bliver')
ok(view.includes('data-testid="product-form-unit-option"'), 'enhedsnavnet bliver')
ok(view.includes('placeholder="Vælg kategori"'), 'kategorien bliver')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-unit-trigger-wrap-test')
