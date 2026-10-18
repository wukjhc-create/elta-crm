/**
 * Statusmærket Aktiv og Inaktiv i kataloget ombrydes. Ordene er uændret.
 *   npx tsx scripts/product-status-wrap-test.ts
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
const expr = "{product.is_active ? 'Aktiv' : 'Inaktiv'}"
for (const id of ['product-status-mobile', 'product-status']) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 160, at + 180) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes('Aktiv'), `${id} aktiv bliver`)
  ok(row.includes('Inaktiv'), `${id} inaktiv bliver`)
  ok(row.includes("variant={product.is_active ? 'default' : 'secondary'}"), `${id} varianten bliver`)
}
ok(view.split(expr).length - 1 === 2, 'to statusmaerker')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-status-wrap-test')
