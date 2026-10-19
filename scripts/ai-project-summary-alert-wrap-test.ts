/**
 * Opsummeringens risikoikon kan krympe. Etiketten Risikoniveau er uaendret.
 *   npx tsx scripts/ai-project-summary-alert-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-alert"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 break-words min-w-0" data-testid="ai-project-summary-alert"'
ok(row.includes('w-5 h-5 break-words min-w-0'), 'risikoikonet kan krympe')
ok(row.includes('<AlertTriangle'), 'det er risikoikonet')
ok(!row.includes('Risikoniveau'), 'etiketten er et andet sted')
ok(!row.includes('formatCurrency'), 'beloebet er et andet sted')
ok(!row.includes('ai-project-warning-icon'), 'advarselsikonet er et andet sted')
ok(!row.includes('text-yellow-600'), 'advarselsfarven er et andet sted')
ok(!row.includes('getRiskLabel'), 'risikoteksten er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('icon={<AlertTriangle className="w-5 h-5" />}'), 'det bare ikon er vaek')
ok(view.includes('label="Risikoniveau"'), 'etiketten bliver')
ok(view.includes('className="w-5 h-5 text-yellow-600 mt-0.5 break-words min-w-0" data-testid="ai-project-warning-icon"'), 'advarselsikonet bliver')
ok(view.includes('getRiskLabel(result.interpretation.risk_score)'), 'risikoteksten bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-alert-wrap-test')
