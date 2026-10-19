/**
 * Bemaerkningslisten paa AI-projekt kan krympe. Teksten {w} er uaendret.
 *   npx tsx scripts/ai-project-warnings-list-wrap-test.ts
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
const id = 'data-testid="ai-project-warnings-list"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 160) : ''
const item = '<li key={i}>• {w}</li>'
ok(row.includes('text-sm text-yellow-700 mt-1 space-y-1 break-words min-w-0'), 'listen kan krympe')
ok(row.includes('space-y-1'), 'afstanden bliver')
ok(row.includes(item), 'teksten bliver i listen')
ok(!row.includes('ai-project-warnings-heading'), 'overskriften er en anden')
ok(!row.includes('ai-project-warnings-box'), 'boksen er en anden')
ok(view.split(id).length === 2, 'listen findes en gang')
ok(view.split('text-sm text-yellow-700 mt-1 space-y-1').length === 2, 'listeklassen findes en gang her')
ok(view.split(item).length === 2, 'advarslen findes en gang')
ok(view.includes('data-testid="ai-project-warnings-heading"'), 'overskriften bliver')
ok(view.includes('>Bemærkninger<'), 'overskriftsteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-warnings-list-wrap-test')
