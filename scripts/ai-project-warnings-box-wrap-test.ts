/**
 * Bemaerkningsboksen paa AI-projekt kan krympe. Overskriften er uaendret.
 *   npx tsx scripts/ai-project-warnings-box-wrap-test.ts
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
const id = 'data-testid="ai-project-warnings-box"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('bg-yellow-50 border border-yellow-200 rounded-lg p-4 break-words min-w-0'), 'boksen kan krympe')
ok(row.includes('border-yellow-200'), 'kanten bliver')
ok(!row.includes('ai-project-warnings-heading'), 'overskriften er en anden')
ok(!row.includes('Bemærkninger'), 'teksten er en anden')
ok(view.split(id).length === 2, 'boksen findes en gang')
ok(view.split('bg-yellow-50 border border-yellow-200 rounded-lg p-4').length === 2, 'den gule boks findes en gang her')
ok(view.includes('data-testid="ai-project-warnings-heading"'), 'overskriften bliver')
ok(view.includes('>Bemærkninger<'), 'teksten bliver')
ok(view.includes('<li key={i}>• {w}</li>'), 'advarslen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-warnings-box-wrap-test')
