/**
 * Moderat-risikoikonet kan krympe. Teksten Moderat er uaendret.
 *   npx tsx scripts/ai-project-risk-medium-icon-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-medium-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-4 h-4 text-yellow-500 break-words min-w-0" data-testid="ai-project-risk-medium-icon" />'
ok(row.includes('w-4 h-4 text-yellow-500 break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-yellow-500'), 'farven bliver')
ok(!row.includes('Moderat'), 'teksten Moderat er et andet sted i snittet')
ok(!row.includes('text-green-500'), 'lav-ikonet er et andet sted')
ok(!row.includes('text-orange-500'), 'hoej-ikonet er et andet sted')
ok(!row.includes('text-yellow-600'), 'advarselsikonet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('className="w-4 h-4 text-yellow-500"'), 'det bare ikon er vaek')
ok(view.includes("{risk.severity === 'medium' && 'Moderat'}"), 'teksten Moderat bliver')
ok(view.includes('className="w-4 h-4 text-green-500 break-words min-w-0"'), 'lav-ikonet bliver')
ok(view.includes('className="w-4 h-4 text-orange-500 break-words min-w-0" data-testid="ai-project-risk-high-icon" />'), 'hoej-ikonet bliver')
ok(view.includes('className="w-4 h-4 text-red-500 break-words min-w-0" data-testid="ai-project-risk-critical-icon" />'), 'kritisk-ikonet bliver')
ok(view.includes('text-yellow-600'), 'advarselsikonet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-medium-icon-wrap-test')
