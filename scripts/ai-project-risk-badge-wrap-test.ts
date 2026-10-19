/**
 * Risikomaerket kan krympe. Teksterne Lav, Moderat, Hoej og Kritisk er uaendrede.
 *   npx tsx scripts/ai-project-risk-badge-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-badge"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'variant="secondary" className="text-xs break-words min-w-0" data-testid="ai-project-risk-badge">'
ok(row.includes('text-xs break-words min-w-0'), 'maerket kan krympe')
ok(row.includes('secondary'), 'varianten bliver')
ok(!row.includes('Lav'), 'Lav er et andet sted i snittet')
ok(!row.includes('Moderat'), 'Moderat er et andet sted i snittet')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-risk-text'), 'tekstkolonnen er et andet sted')
ok(view.split(id).length === 2, 'maerket findes en gang')
ok(view.split(cell).length === 2, 'maerkeklassen findes en gang')
ok(!view.includes('className="text-xs"'), 'det bare maerke er vaek')
ok(view.includes("{risk.severity === 'low' && 'Lav'}"), 'Lav bliver')
ok(view.includes("{risk.severity === 'medium' && 'Moderat'}"), 'Moderat bliver')
ok(view.includes("{risk.severity === 'high' && 'Høj'}"), 'Hoej bliver')
ok(view.includes("{risk.severity === 'critical' && 'Kritisk'}"), 'Kritisk bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-badge-wrap-test')
