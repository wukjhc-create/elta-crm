/**
 * Kolonneoverskrifterne på prisadvarslerne ombrydes. Ordene er uændret.
 *   npx tsx scripts/pricing-alert-head-wrap-test.ts
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

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
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
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 90, at + 60) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(word), `${word} er uændret`)
}
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(view.includes('alert.change_percentage.toFixed(1)'), 'aendringen bliver')
ok(view.includes('font-medium">Nuv. pris</th>'), 'tendensoverskriften venter')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-head-wrap-test')
