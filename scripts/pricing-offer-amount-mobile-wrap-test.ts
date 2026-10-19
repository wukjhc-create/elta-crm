/**
 * Tilbudsbeløbet på berørte tilbuds mobilkort kan krympe. formatCurrency er uændret.
 *   npx tsx scripts/pricing-offer-amount-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-amount-mobile"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('tabular-nums font-medium break-words min-w-0'), 'beløbet kan krympe')
ok(row.includes('{formatCurrency(offer.total_amount)}'), 'beløbet er uændret')
ok(view.includes('text-right font-medium">{formatCurrency(offer.total_amount)}'), 'skrivebordets beløb bliver')
ok(view.includes('tabular-nums font-medium break-words ${offer.potential_loss > 0'), 'tablinjen bliver')
ok(view.includes('formatCurrency(Math.abs(offer.potential_loss))'), 'tabet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-amount-mobile-wrap-test')
