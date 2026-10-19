/**
 * Kategori-vælgeren i produktformularen ombrydes. Pladsholderen Vælg kategori er uændret.
 *   npx tsx scripts/product-form-category-trigger-wrap-test.ts
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
const at = view.indexOf('placeholder="Vælg kategori"')
const row = at >= 0 ? view.slice(at - 160, at + 50) : ''
ok(row.includes('<SelectTrigger className="break-words min-w-0">'), 'vaelgeren ombrydes')
ok(row.includes('placeholder="Vælg kategori"'), 'pladsholderen er uændret')
ok(view.includes("defaultValue={product?.category_id || ''}"), 'kategorien bliver')
const unitAt = view.indexOf("defaultValue={product?.unit || 'stk'}")
const unitRow = unitAt >= 0 ? view.slice(unitAt, unitAt + 160) : ''
ok(unitRow.includes('<SelectTrigger>') && !unitRow.includes('<SelectTrigger className'), 'enhedsvælgeren venter')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-category-trigger-wrap-test')
