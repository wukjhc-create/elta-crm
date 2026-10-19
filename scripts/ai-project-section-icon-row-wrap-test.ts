/**
 * Ikonraekken ved sektionens fold kan krympe. Hurtig-estimatets raekker bliver.
 *   npx tsx scripts/ai-project-section-icon-row-wrap-test.ts
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
const id = 'data-testid="ai-project-section-icon-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 320) : ''
const cell = 'className="flex items-center gap-2 break-words min-w-0" data-testid="ai-project-section-icon-row"'
ok(row.includes('flex items-center gap-2 break-words min-w-0'), 'ikonraekken kan krympe')
ok(row.includes('<div'), 'det er ikonraekken')
ok(row.includes('ai-project-section-chevron-up'), 'fold-ud-ikonet ligger i raekken')
ok(row.includes('<ChevronDown'), 'fold-ind-ikonet ligger i raekken')
ok(!row.includes('{title}'), 'titelteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-building-icon'), 'hurtig-estimatet er et andet sted')
ok(!row.includes('ai-project-section-toggle'), 'hovedet er et andet sted')
ok(view.split(id).length === 2, 'ikonraekken findes en gang')
ok(view.split(cell).length === 2, 'ikonraekkens klasse findes en gang')
ok(view.split('className="flex items-center gap-2"').length === 5, 'fire hurtig-estimat-raekker bliver')
ok(view.includes('<ChevronUp className="w-5 h-5 break-words min-w-0" data-testid="ai-project-section-chevron-up" />'), 'fold-ud-ikonet bliver')
ok(view.includes('<ChevronDown className="w-5 h-5 break-words min-w-0" data-testid="ai-project-section-chevron-down" />'), 'fold-ind-ikonet bliver')
ok(view.split('>{title}<').length === 2, 'titelteksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-section-icon-row-wrap-test')
