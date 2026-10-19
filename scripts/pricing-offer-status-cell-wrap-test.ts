/**
 * Statuscellen på berørte tilbud ombrydes. StatusBadge er uændret.
 *   npx tsx scripts/pricing-offer-status-cell-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-status-cell"')
const row = at >= 0 ? view.slice(at - 40, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'cellen ombrydes')
ok(row.includes('<StatusBadge status={offer.status} />'), 'statussen er uændret')
ok(view.includes('formatCurrency(offer.total_amount)'), 'tilbudsbeløbet bliver')
ok(view.includes("draft: 'Kladde'"), 'Kladde bliver')
ok(view.includes("accepted: 'Accepteret'"), 'Accepteret bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-status-cell-wrap-test')
