/**
 * Etiketten Beskrivelse i produktformularen ombrydes. Ordet er uændret.
 *   npx tsx scripts/product-form-description-label-wrap-test.ts
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
const at = view.indexOf('data-testid="product-form-description-label"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('className="break-words min-w-0"'), 'etiketten ombrydes')
ok(row.includes('htmlFor="description"'), 'koblingen er uændret')
ok(row.includes('>Beskrivelse<'), 'ordet er uændret')
ok(view.includes('id="description"'), 'feltet bliver')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-description-label-wrap-test')
