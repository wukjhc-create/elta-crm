/**
 * Tab-mærket på berørte tilbuds skrivebord kan krympe. Beløbet er uændret.
 *   npx tsx scripts/pricing-offer-loss-span-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-loss-span"')
const row = at >= 0 ? view.slice(at - 220, at + 180) : ''
ok(row.includes('font-medium break-words min-w-0'), 'mærket kan krympe')
ok(row.includes("{offer.potential_loss > 0 ? '-' : '+'}"), 'fortegn er uændret')
ok(row.includes('{formatCurrency(Math.abs(offer.potential_loss))}'), 'beløbet er uændret')
ok(row.includes("offer.potential_loss > 0 ? 'text-red-600' : 'text-green-600'"), 'farverne er uændrede')
ok(view.includes('data-testid="pricing-offer-loss-desktop"'), 'cellen bliver')
ok(view.includes('data-testid="pricing-offer-loss-mobile"'), 'mobiltabet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-loss-span-wrap-test')
