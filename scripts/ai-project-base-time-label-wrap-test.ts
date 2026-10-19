/**
 * Etiketten Basis tid ombrydes. Teksten er uaendret.
 *   npx tsx scripts/ai-project-base-time-label-wrap-test.ts
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
const id = 'data-testid="ai-project-base-time-label"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>Basis tid<'), 'teksten er uaendret')
ok(view.split('Basis tid').length === 2, 'teksten findes en gang')
ok(view.includes('result.calculation.time.base_hours.toFixed(1)'), 'basistiden bliver')
ok(view.includes('data-testid="ai-project-time-heading"'), 'tidsberegning bliver')
ok(view.includes('data-testid="ai-project-warnings-heading"'), 'bemaerkninger bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-base-time-label-wrap-test')
