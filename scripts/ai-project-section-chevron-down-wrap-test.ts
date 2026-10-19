/**
 * Fold-ind-ikonet i sektionen kan krympe. ChevronUp er uaendret.
 *   npx tsx scripts/ai-project-section-chevron-down-wrap-test.ts
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
const id = 'data-testid="ai-project-section-chevron-down"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 break-words min-w-0" data-testid="ai-project-section-chevron-down"'
ok(row.includes('w-5 h-5 break-words min-w-0'), 'fold-ind-ikonet kan krympe')
ok(row.includes('<ChevronDown'), 'det er fold-ind-ikonet')
ok(!row.includes('ChevronUp'), 'fold-ud-ikonet er et andet sted')
ok(!row.includes('ai-project-section-chevron-up'), 'fold-ud-testid er et andet sted')
ok(!row.includes('{title}'), 'titelteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<ChevronDown className="w-5 h-5" />'), 'det bare fold-ind-ikon er vaek')
ok(view.includes('<ChevronUp className="w-5 h-5 break-words min-w-0" data-testid="ai-project-section-chevron-up" />'), 'fold-ud-ikonet bliver')
ok(view.split('>{title}<').length === 2, 'titelteksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-section-chevron-down-wrap-test')
