/**
 * Materialekortets mærke og enhed kan ombrydes. Navn, priser og avance er uændret.
 *   npx tsx scripts/materials-card-meta-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'settings', 'kalkia', 'materials', 'materials-catalog-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="materials-card-meta"')
const end = view.indexOf('data-testid="materials-card-prices"', start)
const meta = start >= 0 && end > start ? view.slice(start - 140, end) : ''
ok(meta.includes('data-testid="materials-card-meta"'), 'mærket kan findes')
ok(meta.includes('flex flex-wrap') && meta.includes('min-w-0'), 'mærke og enhed ombrydes')
ok(meta.includes('break-words">{material.brand}'), 'mærket ombrydes')
ok(meta.includes('break-words">Enhed: {material.unit}'), 'enheden ombrydes')
ok(!meta.includes('truncate'), 'mærket klippes ikke')
ok(view.includes('data-testid="materials-card-name"'), 'navnerækken er uændret')
ok(view.includes('{material.sku || material.id.slice(0, 8)}'), 'varenummeret er uændret')
ok(view.includes('const calculateMargin = (cost: number, sale: number) => calculateDBPercentage(cost, sale)'), 'avanceformlen er uændret')
ok(view.includes("formatCurrency(material.cost_price, 'DKK', 2)"), 'kostkaldet er uændret')
ok(view.includes("formatCurrency(material.sale_price, 'DKK', 2)"), 'salgskaldet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  materials-card-meta-wrap-test')
