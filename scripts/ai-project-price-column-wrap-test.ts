/**
 * Prisopbygningens kolonne kan krympe. Tidsberegningens kolonne og beloebene bliver.
 *   npx tsx scripts/ai-project-price-column-wrap-test.ts
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
const id = 'data-testid="ai-project-price-column"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 180) : ''
const cell = 'className="break-words min-w-0" data-testid="ai-project-price-column"'
ok(row.includes('<div'), 'det er priskolonnen')
ok(row.includes('break-words min-w-0'), 'priskolonnen kan krympe')
ok(row.includes('>Prisopbygning</h4>'), 'overskriften ligger i kolonnen')
ok(row.includes('ai-project-price-heading'), 'prisoverksriften ligger i kolonnen')
ok(!row.includes('Tidsberegning'), 'tidskolonnen er en anden')
ok(!row.includes('formatCurrency'), 'beloebene er et andet sted')
ok(!row.includes('<dl'), 'listen er et andet sted')
ok(!row.includes('Materialer'), 'materialer er et andet sted')
ok(view.split(id).length === 2, 'priskolonnen findes en gang')
ok(view.split(cell).length === 2, 'priskolonens klasse findes en gang')
ok(!view.includes('<div>\r\n                <h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-price-heading">'), 'den bare priskolonne er vaek')
ok(view.includes('<div>\r\n                <h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-time-heading">'), 'tidskolonnen bliver bar')
ok(view.includes('text-green-600 break-words">{formatCurrency(result.calculation.price.total_price)}'), 'totalprisen bliver')
ok(view.includes('data-testid="ai-project-price-total-label">Total</dt>'), 'totaletiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-price-column-wrap-test')
