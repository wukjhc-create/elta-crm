/**
 * Pladsholderen på produktbeskrivelsen ombrydes. Teksten Produktbeskrivelse... er uændret.
 *   npx tsx scripts/product-form-description-placeholder-wrap-test.ts
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
const at = view.indexOf('data-testid="product-form-description"')
const row = at >= 0 ? view.slice(at - 280, at + 40) : ''
ok(row.includes('className="break-words min-w-0"'), 'pladsholderen ombrydes')
ok(row.includes('placeholder="Produktbeskrivelse..."'), 'teksten er uændret')
ok(row.includes("defaultValue={product?.description || ''}"), 'beskrivelsen bliver')
ok(row.includes('rows={3}'), 'raekkerne bliver')
ok(view.includes('data-testid="product-form-description-label"'), 'etiketten bliver')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-description-placeholder-wrap-test')
