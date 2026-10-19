/**
 * Berørte tilbuds skrivebordsramme kan krympe. Nummer og beløb er uændrede.
 *   npx tsx scripts/pricing-offer-desktop-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-desktop"')
const row = at >= 0 ? view.slice(at - 160, at + 3200) : ''
ok(row.includes('overflow-hidden min-w-0'), 'rammen kan krympe')
ok(row.includes('data-testid="pricing-offer-scroll"'), 'rullen bliver')
ok(row.includes('{offer.offer_number}'), 'nummeret er uændret')
ok(row.includes('text-right font-medium break-words min-w-0" data-testid="pricing-offer-amount-desktop">{formatCurrency(offer.total_amount)}'), 'beløbet er uændret')
ok(view.split('<div className="hidden md:block bg-white rounded-lg border overflow-hidden">').length - 1 === 0, 'ingen upakket ramme')
ok(view.split('{offer.offer_number}').length - 1 === 2, 'to numre')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-desktop-wrap-test')
