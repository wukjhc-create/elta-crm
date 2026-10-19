/**
 * Prisadvarslens kolonnerække kan krympe. Navn og priser er uændrede.
 *   npx tsx scripts/pricing-alert-head-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')
ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-alert-head"')
const row = at >= 0 ? view.slice(at - 80, at + 2800) : ''
ok(row.includes('bg-gray-50 min-w-0'), 'rækken kan krympe')
ok(row.includes('data-testid="pricing-alert-col-product"'), 'produktkolonnen bliver')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes('text-right text-gray-500 break-words min-w-0" data-testid="pricing-alert-old-desktop">{formatCurrency(alert.old_price)}'), 'gammel pris er uændret')
ok(row.includes('text-right font-medium">{formatCurrency(alert.new_price)}'), 'ny pris er uændret')
ok(view.split('<tr className="border-b bg-gray-50">').length - 1 === 0, 'ingen upakket kolonnerække')
const words: Array<[string, string]> = [
  ['pricing-alert-col-product', '>Produkt<'],
  ['pricing-alert-col-supplier', '>Leverandør<'],
  ['pricing-alert-col-old', '>Gammel pris<'],
  ['pricing-alert-col-new', '>Ny pris<'],
  ['pricing-alert-col-change', '>Ændring<'],
  ['pricing-alert-col-affects', '>Påvirker<'],
  ['pricing-alert-col-date', '>Dato<'],
]
for (const [id, word] of words) {
  const header = view.indexOf(`data-testid="${id}"`)
  const cell = header >= 0 ? view.slice(header - 90, header + 60) : ''
  ok(cell.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(cell.includes(word), `${word} er uændret`)
}
ok(view.includes('alert.change_percentage.toFixed(1)'), 'aendringen bliver')
ok(view.includes('>Nuv. pris<'), 'tendensordet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-head-wrap-test')
