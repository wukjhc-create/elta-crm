/**
 * Opsummeringens tidsikon kan krympe. Etiketten Estimeret tid er uaendret.
 *   npx tsx scripts/ai-project-summary-clock-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-clock"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 break-words min-w-0" data-testid="ai-project-summary-clock"'
ok(row.includes('w-5 h-5 break-words min-w-0'), 'tidsikonet kan krympe')
ok(row.includes('<Clock'), 'det er tidsikonet')
ok(!row.includes('Estimeret tid'), 'etiketten er et andet sted')
ok(!row.includes('formatCurrency'), 'beloebet er et andet sted')
ok(!row.includes('ai-project-history-clock'), 'historikikonet er et andet sted')
ok(!row.includes('ai-project-estimate-clock'), 'hurtig estimat er et andet sted')
ok(!row.includes('timer'), 'timeteksten er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('icon={<Clock className="w-5 h-5" />}'), 'det bare ikon er vaek')
ok(view.includes('label="Estimeret tid"'), 'etiketten bliver')
ok(view.includes('className="w-5 h-5 text-gray-500 break-words min-w-0" data-testid="ai-project-history-clock"'), 'historikikonet bliver')
ok(view.includes('data-testid="ai-project-estimate-clock"'), 'hurtig estimats ikon bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-clock-wrap-test')
