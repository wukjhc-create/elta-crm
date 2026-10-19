/**
 * Hurtig-estimatets fejltekst kan krympe. Fejlteksten er uaendret.
 *   npx tsx scripts/ai-project-quick-error-wrap-test.ts
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
const id = 'data-testid="ai-quick-load-error"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 160) : ''
const cell = 'className="mt-4 text-sm text-red-700 break-words min-w-0" data-testid="ai-quick-load-error"'
ok(row.includes('<p'), 'det er fejlteksten')
ok(row.includes('mt-4 text-sm text-red-700 break-words min-w-0'), 'fejlteksten kan krympe')
ok(row.includes('{quickError}'), 'fejlen bliver i raekken')
ok(row.includes('Det forrige estimat bliver.'), 'det forrige estimat bliver')
ok(row.includes('Det tælles ikke som et estimat.'), 'det tomme estimat bliver')
ok(!row.includes('ai-history-load-error'), 'historikfejlen er en anden')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-quick-box'), 'estimatkortet er et andet sted')
ok(!row.includes('ai-project-charger-unpriced'), 'laderteksten er et andet sted')
ok(view.split(id).length === 2, 'fejlteksten findes en gang')
ok(view.split(cell).length === 2, 'fejltekstens klasse findes en gang')
ok(!view.includes('mt-4 text-sm text-red-700 break-words"'), 'den gamle klasse er vaek')
ok(view.includes('data-testid="ai-history-load-error"'), 'historikfejlen bliver')
ok(view.includes('formatCurrency(quickResult.estimatedPrice)'), 'estimatbeloebet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-quick-error-wrap-test')
