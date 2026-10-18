/**
 * Materialekortets kost og salg kan ombrydes. Beløb og avance er uændret.
 *   npx tsx scripts/materials-card-price-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'settings', 'kalkia', 'materials', 'materials-catalog-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="materials-card-prices"')
const end = view.indexOf('Avance', start)
const prices = start >= 0 && end > start ? view.slice(start - 120, end) : ''
ok(prices.includes('data-testid="materials-card-prices"'), 'priserne kan findes')
ok(prices.includes('flex flex-wrap') && prices.includes('min-w-0'), 'kost og salg ombrydes')
ok(prices.includes('break-words">{formatCurrency(material.cost_price, \'DKK\', 2)}'), 'kost ombrydes')
ok(prices.includes('break-words">{formatCurrency(material.sale_price, \'DKK\', 2)}'), 'salg ombrydes')
ok(!prices.includes('flex items-center gap-6'), 'priserne er ikke én fast linje')
ok(!prices.includes('truncate'), 'priserne klippes ikke')
ok(view.includes('const calculateMargin = (cost: number, sale: number) => calculateDBPercentage(cost, sale)'), 'avanceformlen er uændret')
ok(view.includes("formatCurrency(material.cost_price, 'DKK', 2)"), 'kostkaldet er uændret')
ok(view.includes("formatCurrency(material.sale_price, 'DKK', 2)"), 'salgskaldet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  materials-card-price-wrap-test')
