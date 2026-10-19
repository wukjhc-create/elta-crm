/**
 * Overskriften Prisopbygning ombrydes. Teksten er uændret.
 *   npx tsx scripts/ai-project-price-heading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const id = 'data-testid="ai-project-price-heading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('>Prisopbygning</h4>'), 'teksten er uændret')
ok(view.split('>Prisopbygning</h4>').length === 2, 'teksten findes en gang')
ok(view.includes('>Komponenter</h4>'), 'komponentankeret bliver')
ok(view.includes('break-words">{formatCurrency(result.calculation.price.material_cost)}'), 'materialeprisen bliver')
ok(view.includes('break-words">{formatCurrency(result.calculation.price.labor_cost)}'), 'loenprisen bliver')
ok(view.includes('text-green-600 break-words">{formatCurrency(result.calculation.price.total_price)}'), 'totalen bliver')
ok(view.includes('{result.calculation.price.margin_percentage}%'), 'marginprocenten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-price-heading-wrap-test')
