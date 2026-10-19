/**
 * Prisadvarslens skrivebordsramme kan krympe. Navn og priser er uændrede.
 *   npx tsx scripts/pricing-alert-desktop-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-desktop"')
const row = at >= 0 ? view.slice(at - 160, at + 3400) : ''
ok(row.includes('overflow-hidden min-w-0'), 'rammen kan krympe')
ok(row.includes('data-testid="pricing-alert-scroll"'), 'rullen bliver')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes('text-right text-gray-500 break-words min-w-0" data-testid="pricing-alert-old-desktop">{formatCurrency(alert.old_price)}'), 'gammel pris er uændret')
ok(row.includes('text-right font-medium">{formatCurrency(alert.new_price)}'), 'ny pris er uændret')
ok(view.split('<div className="hidden md:block bg-white rounded-lg border overflow-hidden">').length - 1 === 0, 'ingen upakket ramme')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-desktop-wrap-test')
