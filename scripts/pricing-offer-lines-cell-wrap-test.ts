/**
 * Linjecellen på berørte tilbud ombrydes. Antallet er uændret.
 *   npx tsx scripts/pricing-offer-lines-cell-wrap-test.ts
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

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-offer-lines-cell"')
const row = at >= 0 ? view.slice(at - 40, at + 320) : ''
ok(row.includes('break-words min-w-0'), 'cellen ombrydes')
ok(row.includes('{offer.affected_items}'), 'antallet er uændret')
ok(row.includes('bg-amber-100 text-amber-700'), 'farven er uændret')
ok(view.includes('formatCurrency(offer.total_amount)'), 'tilbudsbeløbet bliver')
ok(view.split('{offer.affected_items}').length - 1 === 2, 'to tal')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-lines-cell-wrap-test')
