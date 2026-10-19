/**
 * Overskriften Kompleksitetsfaktorer ombrydes. Teksten er uændret.
 *   npx tsx scripts/ai-project-complexity-heading-wrap-test.ts
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
const id = 'data-testid="ai-project-complexity-heading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('>Kompleksitetsfaktorer</h4>'), 'teksten er uændret')
ok(view.split('Kompleksitetsfaktorer').length === 2, 'teksten findes en gang')
ok(view.includes('>Elpunkter</h4>'), 'elpunktankeret bliver')
ok(view.includes('>Bygningsinformation</h4>'), 'bygningsankeret bliver')
ok(view.includes('{f.name} (×{f.multiplier})'), 'faktoren bliver')
ok(view.includes('data-testid="ai-project-time-heading"'), 'tidsberegning bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-complexity-heading-wrap-test')
