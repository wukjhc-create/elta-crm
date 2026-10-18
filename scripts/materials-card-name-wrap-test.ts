/**
 * Materialekortets navn og varenummer kan ombrydes. Priser og avance er uændret.
 *   npx tsx scripts/materials-card-name-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'settings', 'kalkia', 'materials', 'materials-catalog-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="materials-card-name"')
const end = view.indexOf('data-testid="materials-card-prices"', start)
const name = start >= 0 && end > start ? view.slice(start - 80, end) : ''
ok(name.includes('data-testid="materials-card-name"'), 'navnet kan findes')
ok(name.includes('flex flex-wrap') && name.includes('min-w-0'), 'navnerækken ombrydes')
ok(name.includes('break-words min-w-0">{material.name}'), 'navnet ombrydes')
ok(name.includes('whitespace-normal break-words'), 'varenummeret ombrydes')
ok(name.includes('{material.sku || material.id.slice(0, 8)}'), 'varenummeret er uændret')
ok(!name.includes('truncate'), 'navnet klippes ikke')
ok(view.includes('const calculateMargin = (cost: number, sale: number) => calculateDBPercentage(cost, sale)'), 'avanceformlen er uændret')
ok(view.includes("formatCurrency(material.cost_price, 'DKK', 2)"), 'kostkaldet er uændret')
ok(view.includes("formatCurrency(material.sale_price, 'DKK', 2)"), 'salgskaldet er uændret')
ok(view.includes('data-testid="materials-card-prices"'), 'prisklyngen er stadig der')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  materials-card-name-wrap-test')
