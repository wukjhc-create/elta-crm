/**
 * AI-projektets sidehoved kan krympe. Overskriften er uaendret.
 *   npx tsx scripts/ai-project-page-head-wrap-test.ts
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
const id = 'data-testid="ai-project-page-head"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="mb-8 break-words min-w-0" data-testid="ai-project-page-head"'
ok(row.includes('mb-8 break-words min-w-0'), 'sidehovedet kan krympe')
ok(!row.includes('AI Projektanalyse'), 'overskriften er et andet sted')
ok(view.split(id).length === 2, 'sidehovedet findes en gang')
ok(view.split(cell).length === 2, 'sidehovedklassen findes en gang')
ok(!view.includes('className="mb-8"'), 'den bare ramme er væk')
ok(view.includes('data-testid="ai-project-page-title"'), 'overskriften bliver')
ok(view.split('AI Projektanalyse').length === 2, 'overskriftsteksten findes en gang')
ok(view.includes('data-testid="ai-project-intro"'), 'indledningen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-page-head-wrap-test')
