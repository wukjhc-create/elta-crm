/**
 * Lagret kostpris. Ingen opfundet pris. Ingen DB.
 *   npx tsx scripts/stored-cost-text-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { storedCostText } from '../src/lib/products/stored-cost-text'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

ok(storedCostText(null) === 'Ingen lagret pris', 'null er ikke 0 kr')
ok(storedCostText(undefined) === 'Ingen lagret pris', 'undefined er ikke 0 kr')
ok(Number.isNaN(storedCostText(Number.NaN) as unknown as number) || storedCostText(Number.NaN) === 'Ingen lagret pris', 'NaN er ikke en pris')
ok(storedCostText(0) === formatCurrency(0), 'lagret 0 bruger formatCurrency', storedCostText(0))
ok(storedCostText(0) !== 'Ingen lagret pris', 'lagret 0 skjules ikke')
ok(storedCostText(150) === formatCurrency(150), '150 kr er den lagrede pris')

const list = readFileSync(join('src', 'app', 'dashboard', 'products', 'products-client.tsx'), 'utf8')
ok(list.includes('{canSeeCost && ('), 'kost ligger stadig bag canSeeCost')
// main har kun tabelvisningen (Groks mobilkort er ikke integreret) — teksten bruges dér
ok((list.match(/storedCostText\(product\.cost_price\)/g) ?? []).length >= 1, 'produktlisten bruger teksten')
ok(list.includes('{formatCurrency(product.list_price)}'), 'listeprisen er uændret')

const detail = readFileSync(join('src', 'app', 'dashboard', 'products', '[id]', 'product-detail-client.tsx'), 'utf8')
ok(detail.includes('product.cost_price && product.list_price'), 'avanceformlen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  stored-cost-text-test')
