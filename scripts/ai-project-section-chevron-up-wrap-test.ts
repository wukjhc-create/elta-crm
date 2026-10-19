/**
 * Fold-ud-ikonet i sektionen kan krympe. Fold-ind-ikonet er pakket for sig.
 *   npx tsx scripts/ai-project-section-chevron-up-wrap-test.ts
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
const id = 'data-testid="ai-project-section-chevron-up"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 break-words min-w-0" data-testid="ai-project-section-chevron-up"'
ok(row.includes('w-5 h-5 break-words min-w-0'), 'fold-ud-ikonet kan krympe')
ok(row.includes('<ChevronUp'), 'det er fold-ud-ikonet')
ok(!row.includes('ChevronDown'), 'fold-ind-ikonet er et andet sted')
ok(!row.includes('{title}'), 'titelteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<ChevronUp className="w-5 h-5" />'), 'det bare fold-ud-ikon er vaek')
ok(view.includes('<ChevronDown className="w-5 h-5 break-words min-w-0" data-testid="ai-project-section-chevron-down" />'), 'fold-ind-ikonet bliver')
ok(view.split('>{title}<').length === 2, 'titelteksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-section-chevron-up-wrap-test')
