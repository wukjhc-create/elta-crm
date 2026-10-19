/**
 * Opsummeringens komponentikon kan krympe. Etiketten Komponenter er uaendret.
 *   npx tsx scripts/ai-project-summary-package-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-package"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 break-words min-w-0" data-testid="ai-project-summary-package"'
ok(row.includes('w-5 h-5 break-words min-w-0'), 'komponentikonet kan krympe')
ok(row.includes('<Package'), 'det er komponentikonet')
ok(!row.includes('Komponenter'), 'etiketten er et andet sted')
ok(!row.includes('formatCurrency'), 'beloebet er et andet sted')
ok(!row.includes('quantity'), 'antallet er et andet sted')
ok(!row.includes('ai-project-summary-clock'), 'tidsikonet er et andet sted')
ok(!row.includes('ai-project-summary-alert'), 'risikoikonet er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('icon={<Package className="w-5 h-5" />}'), 'det bare ikon er vaek')
ok(view.includes('label="Komponenter"'), 'etiketten bliver')
ok(view.includes('result.calculation.components.reduce((s, c) => s + c.quantity, 0)'), 'antallet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')
ok(view.includes('data-testid="ai-project-summary-clock"'), 'tidsikonet bliver')
ok(view.includes('data-testid="ai-project-summary-alert"'), 'risikoikonet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-package-wrap-test')
