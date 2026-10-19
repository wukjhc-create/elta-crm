/**
 * Fluebenet ved ingen risici kan krympe. Teksten er uaendret.
 *   npx tsx scripts/ai-project-empty-risk-check-wrap-test.ts
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
const id = 'data-testid="ai-project-empty-risk-check"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 break-words min-w-0" data-testid="ai-project-empty-risk-check"'
const text = 'Ingen væsentlige risici identificeret'
ok(row.includes('w-5 h-5 break-words min-w-0'), 'fluebenet kan krympe')
ok(row.includes('<CheckCircle2'), 'det er fluebenet')
ok(!row.includes(text), 'teksten er et andet sted')
ok(!row.includes('ai-project-no-risks"'), 'tekst-id er et andet sted')
ok(!row.includes('ai-project-risk-low-icon'), 'lav-ikonet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'fluebenet findes en gang')
ok(view.split(cell).length === 2, 'fluebenklassen findes en gang')
ok(!view.includes('<CheckCircle2 className="w-5 h-5" />'), 'det bare flueben er vaek')
ok(view.split(text).length === 2, 'teksten findes en gang')
ok(view.includes('data-testid="ai-project-no-risks">' + text), 'teksten bliver')
ok(view.includes('className="w-4 h-4 text-green-500 break-words min-w-0" data-testid="ai-project-risk-low-icon" />'), 'lav-ikonet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-empty-risk-check-wrap-test')
