/**
 * AI-projektets side kan krympe. Indholdet er uaendret.
 *   npx tsx scripts/ai-project-page-wrap-test.ts
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
const id = 'data-testid="ai-project-page"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('p-6 max-w-6xl mx-auto break-words min-w-0'), 'siden kan krympe')
ok(row.includes('max-w-6xl'), 'bredden bliver')
ok(!row.includes('ai-project-page-title'), 'titlen er en anden')
ok(!row.includes('ai-project-intro'), 'indledningen er en anden')
ok(view.split(id).length === 2, 'siden findes en gang')
ok(view.includes('data-testid="ai-project-page-title"'), 'titlen bliver')
ok(view.includes('data-testid="ai-project-intro"'), 'indledningen bliver')
ok(view.includes('formatCurrency(analysis.total_price)'), 'historikprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-page-wrap-test')
