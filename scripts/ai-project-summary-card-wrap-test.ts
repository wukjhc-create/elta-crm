/**
 * Opsummeringskortets ramme kan krympe. Tal og note er uaendret.
 *   npx tsx scripts/ai-project-summary-card-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-card"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="bg-white border rounded-lg p-4 break-words min-w-0" data-testid="ai-project-summary-card"'
ok(row.includes('bg-white border rounded-lg p-4 break-words min-w-0'), 'rammen kan krympe')
ok(!row.includes('{value}'), 'tallet er et andet')
ok(!row.includes('{sublabel}'), 'noten er en anden')
ok(!row.includes('{label}'), 'etiketten er en anden')
ok(!row.includes('{icon}'), 'ikonet er et andet')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(!view.includes('className="bg-white border rounded-lg p-4"'), 'den bare ramme er væk')
ok(view.includes('data-testid="ai-project-summary-value">{value}'), 'tallet bliver')
ok(view.includes('data-testid="ai-project-summary-sublabel">{sublabel}'), 'noten bliver')
ok(view.includes('data-testid="ai-project-summary-label">{label}'), 'etiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-card-wrap-test')
