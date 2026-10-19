/**
 * Kopier-ikonet ved tilbudsteksten kan krympe. Teksten Kopier er uaendret.
 *   npx tsx scripts/ai-project-offer-copy-icon-wrap-test.ts
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
const id = 'data-testid="ai-project-offer-copy-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-4 h-4 mr-1 break-words min-w-0" data-testid="ai-project-offer-copy-icon"'
const exact = (src: string) => src.split(/\r?\n/).filter((line) => line.trim() === 'Kopier').length
ok(row.includes('w-4 h-4 mr-1 break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('<Copy'), 'det er kopier-ikonet')
ok(!row.includes('Kopier'), 'teksten er et andet sted')
ok(!row.includes('ai-project-copy"'), 'kopier-knappen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!id.includes('ai-project-copy'), 'id rammer ikke kopier-knappen')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<Copy className="w-4 h-4 mr-1" />'), 'det bare ikon er vaek')
ok(exact(view) === 1, 'teksten findes en gang')
ok(view.includes('data-testid="ai-project-copy"'), 'kopier-knappen bliver')
ok(view.includes('onClick={copyOfferText}'), 'kopieringen bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-offer-copy-icon-wrap-test')
