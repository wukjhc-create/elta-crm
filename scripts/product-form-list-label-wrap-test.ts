/**
 * Etiketten Listepris i produktformularen ombrydes. Ordene og feltets værdi er uændrede.
 *   npx tsx scripts/product-form-list-label-wrap-test.ts
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
const at = view.indexOf('data-testid="product-form-list-label"')
const row = at >= 0 ? view.slice(at - 120, at + 90) : ''
ok(row.includes('className="break-words min-w-0"'), 'etiketten ombrydes')
ok(row.includes('htmlFor="list_price"'), 'koblingen er uændret')
ok(row.includes('>Listepris (DKK) *<'), 'ordene og stjernen er uændrede')
ok(view.includes('name="list_price"'), 'feltet bliver')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(view.includes('data-testid="product-form-cost-label"'), 'kostpris-etiketten bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-list-label-wrap-test')
