/**
 * Risikokortets ramme kan krympe. Kortteksterne er uaendrede.
 *   npx tsx scripts/ai-project-risk-shell-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-shell"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className={`border rounded-lg p-4 break-words min-w-0 ${severityColors[risk.severity]}`} data-testid="ai-project-risk-shell"'
ok(row.includes('border rounded-lg p-4 break-words min-w-0'), 'rammen kan krympe')
ok(row.includes('severityColors[risk.severity]'), 'farven bliver')
ok(!row.includes('{risk.title}'), 'titlen er et andet sted i snittet')
ok(!row.includes('Lav'), 'teksten Lav er et andet sted i snittet')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('bg-white'), 'opsummeringskortet er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(!view.includes('className={`border rounded-lg p-4 ${severityColors[risk.severity]}`}'), 'den bare ramme er vaek')
ok(view.includes('className="bg-white border rounded-lg p-4 break-words min-w-0" data-testid="ai-project-summary-card"'), 'opsummeringskortet bliver')
ok(view.includes('className="font-medium break-words min-w-0" data-testid="ai-project-risk-title">{risk.title}</div>'), 'titlen bliver')
ok(view.includes("{risk.severity === 'low' && 'Lav'}"), 'teksten Lav bliver')
ok(view.includes("{risk.severity === 'medium' && 'Moderat'}"), 'teksten Moderat bliver')
ok(view.includes("{risk.severity === 'high' && 'Høj'}"), 'teksten Hoej bliver')
ok(view.includes("{risk.severity === 'critical' && 'Kritisk'}"), 'teksten Kritisk bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-shell-wrap-test')
