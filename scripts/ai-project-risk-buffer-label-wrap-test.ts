/**
 * Etiketten Risikobuffer ombrydes. Procentudtrykket er uaendret.
 *   npx tsx scripts/ai-project-risk-buffer-label-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-buffer-label"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>Risikobuffer ('), 'teksten er uaendret')
ok(row.includes('{result.calculation.price.risk_buffer_percentage}%'), 'procenten er uaendret')
ok(view.split('Risikobuffer').length === 2, 'teksten findes en gang')
ok(view.includes('break-words">{formatCurrency(result.calculation.price.risk_buffer_amount)}'), 'bufferbeloebet bliver')
ok(view.includes('data-testid="ai-project-subtotal-label"'), 'subtotal bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-buffer-label-wrap-test')
