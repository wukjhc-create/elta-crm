/**
 * Hurtig-estimatets beloebsikon kan krympe. formatCurrency-udtrykket er uaendret.
 *   npx tsx scripts/ai-project-estimate-banknote-wrap-test.ts
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
const id = 'data-testid="ai-project-estimate-banknote"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-4 h-4 text-purple-500 break-words min-w-0" data-testid="ai-project-estimate-banknote"'
ok(row.includes('w-4 h-4 text-purple-500 break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-purple-500'), 'farven bliver')
ok(row.includes('<Banknote'), 'det er beloebsikonet')
ok(!row.includes('formatCurrency'), 'prisen er et andet sted')
ok(!row.includes('estimatedPrice'), 'udtrykket er et andet sted')
ok(!row.includes('ai-project-quick-price'), 'beloebsteksten er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<Banknote className="w-4 h-4 text-purple-500" />'), 'det bare beloebsikon er vaek')
ok(view.includes('icon={<Banknote className="w-5 h-5" />}'), 'opsummeringens prisikon bliver')
ok(view.includes('formatCurrency(quickResult.estimatedPrice)'), 'estimatet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')
ok(view.includes('<Clock className="w-4 h-4 text-purple-500 break-words min-w-0" data-testid="ai-project-estimate-clock" />'), 'tidsikonet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-estimate-banknote-wrap-test')
