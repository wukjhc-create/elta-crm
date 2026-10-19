/**
 * Hurtig estimat kan krympe. Beloebet er uaendret.
 *   npx tsx scripts/ai-project-quick-box-wrap-test.ts
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
const id = 'data-testid="ai-project-quick-box"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('mt-4 p-4 bg-purple-50 rounded-lg break-words min-w-0'), 'boksen kan krympe')
ok(row.includes('bg-purple-50'), 'farven bliver')
ok(!row.includes('ai-project-quick-estimate'), 'overskriften er en anden')
ok(!row.includes('formatCurrency(quickResult.estimatedPrice)'), 'beloebet er et andet')
ok(view.split(id).length === 2, 'boksen findes en gang')
ok(view.split('mt-4 p-4 bg-purple-50 rounded-lg').length === 2, 'den lilla boks findes en gang')
ok(view.includes('data-testid="ai-project-quick-estimate"'), 'overskriften bliver')
ok(view.includes('formatCurrency(quickResult.estimatedPrice)'), 'estimatet er uaendret')
ok(view.includes('>Hurtig estimat<'), 'teksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-quick-box-wrap-test')
