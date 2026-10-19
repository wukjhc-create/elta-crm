/**
 * Historikkens pris kan krympe. formatCurrency(analysis.total_price) er uaendret.
 *   npx tsx scripts/ai-project-history-price-wrap-test.ts
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
const id = 'data-testid="ai-project-history-price"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 40) : ''
const cell = 'className="text-sm font-medium text-gray-900 shrink-0 break-words min-w-0" data-testid="ai-project-history-price"'
ok(row.includes('shrink-0 break-words min-w-0'), 'prisen kan krympe')
ok(row.includes('<span'), 'det er prisspandet')
ok(row.includes('shrink-0'), 'shrink-0 bliver i snittet')
ok(!row.includes('formatCurrency(analysis.total_price)'), 'beloebet er et andet sted')
ok(!row.includes('analysis.description'), 'beskrivelsen er et andet sted')
ok(!row.includes('line-clamp-2'), 'to linjer er et andet sted')
ok(!row.includes('ai-project-history-date'), 'datoen er et andet sted')
ok(view.split(id).length === 2, 'prisen findes en gang')
ok(view.split(cell).length === 2, 'prisklassen findes en gang')
ok(!view.includes('className="text-sm font-medium text-gray-900 shrink-0"'), 'den bare pris er vaek')
ok(view.includes('formatCurrency(analysis.total_price)'), 'beloebet bliver')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen forbliver to linjer')
ok(view.includes('data-testid="ai-project-history-date"'), 'datoen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-price-wrap-test')
