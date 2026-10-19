/**
 * Tilbudsbeløbet på berørte tilbuds skrivebord kan krympe. Beløbet er uændret.
 *   npx tsx scripts/pricing-offer-amount-desktop-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-amount-desktop"')
const row = at >= 0 ? view.slice(at - 140, at + 80) : ''
ok(row.includes('text-right font-medium break-words min-w-0'), 'cellen kan krympe')
ok(row.includes('>{formatCurrency(offer.total_amount)}'), 'beløbet er uændret')
ok(view.includes('data-testid="pricing-offer-amount-mobile"'), 'mobilbeløbet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-amount-desktop-wrap-test')
