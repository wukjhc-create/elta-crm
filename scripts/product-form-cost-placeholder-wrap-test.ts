/**
 * Pladsholderen på kostprisfeltet ombrydes. Tegnene 0,00 og feltets værdi er uændrede.
 *   npx tsx scripts/product-form-cost-placeholder-wrap-test.ts
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
const at = view.indexOf('data-testid="product-form-cost"')
const row = at >= 0 ? view.slice(at - 280, at + 40) : ''
ok(row.includes('className="break-words min-w-0"'), 'pladsholderen ombrydes')
ok(row.includes('placeholder="0,00"'), 'tegnene er uændrede')
ok(row.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(row.includes('id="cost_price"'), 'feltet bliver')
ok(row.includes('type="number"'), 'talfeltet bliver')

const listAt = view.indexOf('id="list_price"')
const listRow = listAt >= 0 ? view.slice(listAt, listAt + 420) : ''
ok(listRow.includes('placeholder="0,00"'), 'listepladsholderen venter')
ok(listRow.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(listRow.includes('data-testid="product-form-list"'), 'listefeltet ombrydes ogsaa')
ok(view.includes('data-testid="product-form-cost-label"'), 'etiketten bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-cost-placeholder-wrap-test')
