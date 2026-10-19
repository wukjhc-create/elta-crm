/**
 * Knapraekken ved tilbudsteksten kan krympe. Knappen Kopier er uaendret.
 *   npx tsx scripts/ai-project-offer-actions-wrap-test.ts
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
const id = 'data-testid="ai-project-offer-actions"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="flex gap-2 break-words min-w-0" data-testid="ai-project-offer-actions"'
const kopierLines = (src: string) => src.split(/\r?\n/).filter((line) => line.trim() === 'Kopier').length
ok(row.includes('flex gap-2 break-words min-w-0'), 'raekken kan krympe')
ok(!row.includes('Kopier'), 'knapteksten er et andet sted')
ok(!row.includes('ai-project-copy'), 'kopier-knappen er et andet sted')
ok(!row.includes('full_offer_text'), 'tilbudsteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(!view.includes('className="flex gap-2"'), 'den bare raekke er vaek')
ok(view.includes('data-testid="ai-project-copy"'), 'kopier-knappen bliver')
ok(view.includes('onClick={copyOfferText}'), 'kopieringen bliver')
ok(kopierLines(view) === 1, 'teksten Kopier findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-offer-actions-wrap-test')
