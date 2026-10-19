/**
 * Berørte tilbuds tabelhoved kan krympe. Nummer og beløb er uændrede.
 *   npx tsx scripts/pricing-offer-thead-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-thead"')
const row = at >= 0 ? view.slice(at - 80, at + 2800) : ''
ok(row.includes('className="min-w-0" data-testid="pricing-offer-thead"'), 'hovedet kan krympe')
ok(row.includes('data-testid="pricing-offer-head"'), 'kolonnerækken bliver')
ok(row.includes('{offer.offer_number}'), 'nummeret er uændret')
ok(row.includes('text-right font-medium break-words min-w-0" data-testid="pricing-offer-amount-desktop">{formatCurrency(offer.total_amount)}'), 'beløbet er uændret')
ok(view.split('<thead>').length - 1 === 0, 'ingen upakket tabelhoved')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-thead-wrap-test')
