/**
 * Eksempelteksten i AI-projekt ombrydes. Teksten er uændret.
 *   npx tsx scripts/ai-project-example-wrap-test.ts
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
const at = view.indexOf('data-testid="ai-project-example-text"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'eksemplet ombrydes')
ok(row.includes('>{example.text}'), 'teksten er uændret')
ok(!row.includes('line-clamp-2'), 'eksemplet klippes ikke til to linjer')
ok(view.includes('onClick={() => handleDescriptionChange(example.text)}'), 'valget bliver')
ok(view.includes('{example.title}'), 'titlen bliver')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'historikken bliver paa to linjer')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-example-wrap-test')
