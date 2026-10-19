/**
 * Elpunkt-tallet i hurtig estimat ombrydes. Udtrykket er uaendret.
 *   npx tsx scripts/ai-project-quick-points-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const id = 'data-testid="ai-project-quick-points"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const expr = '{quickResult.totalPoints} elpunkter'
ok(row.includes('break-words min-w-0'), 'elpunkt-tallet ombrydes')
ok(row.includes(expr), 'udtrykket er uaendret')
ok(view.split(expr).length === 2, 'udtrykket findes en gang')
ok(view.split('>Elpunkter</h4>').length === 2, 'overskriften bliver')
ok(view.includes('data-testid="ai-project-quick-hours"'), 'timetallet bliver')
ok(view.includes('formatCurrency(quickResult.estimatedPrice)'), 'beloebet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-quick-points-wrap-test')
