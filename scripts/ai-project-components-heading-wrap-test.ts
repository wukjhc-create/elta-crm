/**
 * Overskriften Komponenter ombrydes. Teksten er uændret.
 *   npx tsx scripts/ai-project-components-heading-wrap-test.ts
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
const id = 'data-testid="ai-project-components-heading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('>Komponenter</h4>'), 'teksten er uændret')
ok(view.split('>Komponenter</h4>').length === 2, 'teksten findes en gang')
ok(view.includes('data-testid="ai-components-mobile"'), 'mobillisten bliver')
ok(view.includes('break-words font-medium text-gray-900">{comp.name}'), 'komponentnavnet bliver')
ok(view.includes('formatCurrency(comp.total)'), 'komponenttotalen bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('data-testid="ai-project-price-heading"'), 'prisopbygning bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-components-heading-wrap-test')
