/**
 * Overskriften Tidsberegning ombrydes. Teksten er uændret.
 *   npx tsx scripts/ai-project-time-heading-wrap-test.ts
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
const id = 'data-testid="ai-project-time-heading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('>Tidsberegning</h4>'), 'teksten er uændret')
ok(view.split('Tidsberegning').length === 2, 'teksten findes en gang')
ok(view.includes('>Prisopbygning</h4>'), 'prisankeret bliver')
ok(view.includes('>Komponenter</h4>'), 'komponentankeret bliver')
ok(view.includes('result.calculation.time.base_hours.toFixed(1)'), 'basistiden bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen er uændret')
ok(view.includes('formatCurrency(analysis.total_price)'), 'historikprisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-time-heading-wrap-test')
