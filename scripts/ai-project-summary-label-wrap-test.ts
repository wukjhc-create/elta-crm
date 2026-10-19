/**
 * Opsummeringskortets etiket kan krympe. Etiketten er uaendret.
 *   npx tsx scripts/ai-project-summary-label-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-label"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="text-sm text-gray-500 break-words min-w-0" data-testid="ai-project-summary-label"'
ok(row.includes('text-sm text-gray-500 break-words min-w-0'), 'etiketten kan krympe')
ok(row.includes('{label}'), 'etiketten bliver i kortet')
ok(!row.includes('{value}'), 'tallet er et andet')
ok(!row.includes('{sublabel}'), 'noten er en anden')
ok(!row.includes('{icon}'), 'ikonet er et andet')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(cell).length === 2, 'etiketklassen findes en gang')
ok(view.split('{label}').length === 2, 'etiketten bruges en gang')
ok(view.includes('data-testid="ai-project-summary-value">{value}'), 'tallet bliver')
ok(view.includes('data-testid="ai-project-summary-sublabel">{sublabel}'), 'noten bliver')
ok(view.includes('label="Total pris"'), 'totalpris-etiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-label-wrap-test')
