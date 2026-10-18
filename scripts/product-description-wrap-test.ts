/**
 * Produktbeskrivelsen i kataloget ombrydes. Navn, kost og listepris er uændret.
 *   npx tsx scripts/product-description-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'products', 'products-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="product-description"')
const row = at >= 0 ? view.slice(at - 80, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'beskrivelsen ombrydes')
ok(row.includes('{product.description}'), 'teksten er uændret')
ok(!row.includes('line-clamp-1'), 'den klippes ikke til en linje')
ok(view.includes('data-testid="product-description-mobile"'), 'mobilkortet ombrydes')
ok(view.split('hover:text-blue-600 break-words').length - 1 === 2, 'navnelinket bliver')
ok(view.split('formatCurrency(product.list_price)').length - 1 === 2, 'listeprisen bliver')
ok(view.includes('storedCostText(product.cost_price)'), 'kostprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-description-wrap-test')
