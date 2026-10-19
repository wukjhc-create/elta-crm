/**
 * Gem-knappen i produktformularen ombrydes. Ordene Gemmer, Opdater og Opret er uændrede.
 *   npx tsx scripts/product-form-submit-wrap-test.ts
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
const at = view.indexOf('data-testid="product-form-submit"')
const row = at >= 0 ? view.slice(at - 80, at + 180) : ''
ok(row.includes('break-words min-w-0'), 'gem-knappen ombrydes')
ok(row.includes('disabled={isPending}'), 'isPending er uændret')
ok(row.includes("isPending ? 'Gemmer...' : product ? 'Opdater' : 'Opret'"), 'ordene er uændrede')
ok(view.includes('data-testid="product-form-cancel"'), 'annuller bliver')
ok(view.includes("defaultValue={product?.list_price || ''}"), 'listeprisen bliver')
ok(view.includes("defaultValue={product?.cost_price || ''}"), 'kostprisen bliver')
ok(!view.includes('truncate'), 'formularen klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-form-submit-wrap-test')
