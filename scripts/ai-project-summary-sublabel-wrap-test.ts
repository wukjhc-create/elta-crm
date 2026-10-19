/**
 * Opsummeringskortets note kan krympe. Noten er uaendret.
 *   npx tsx scripts/ai-project-summary-sublabel-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-sublabel"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('text-gray-400 break-words min-w-0'), 'noten kan krympe')
ok(row.includes('{sublabel}'), 'noten bliver i kortet')
ok(!row.includes('{value}'), 'tallet er et andet')
ok(!row.includes('ai-project-history-date'), 'historikdatoen er en anden')
ok(!row.includes('copenhagenDateTimeLabel'), 'datokaldet er et andet')
ok(view.split(id).length === 2, 'noten findes en gang')
ok(view.split('{sublabel}').length === 2, 'noten bruges en gang')
ok(view.includes('className="text-xs text-gray-400 break-words min-w-0" data-testid="ai-project-summary-sublabel"'), 'noteklassen bliver')
ok(view.includes('data-testid="ai-project-history-date"'), 'historikdatoen bliver')
ok(view.includes('copenhagenDateTimeLabel(analysis.created_at)'), 'datokaldet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-sublabel-wrap-test')
