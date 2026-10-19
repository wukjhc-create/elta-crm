/**
 * Kundelistens indlaesning kan krympe. Spinneren er uaendret.
 *   npx tsx scripts/ai-project-customer-loading-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-loading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="flex items-center justify-center py-8 break-words min-w-0" data-testid="ai-project-customer-loading"'
ok(row.includes('flex items-center justify-center py-8 break-words min-w-0'), 'indlaesningen kan krympe')
ok(row.includes('justify-center'), 'centreringen bliver')
ok(!row.includes('Loader2'), 'spinneren er et andet sted i snittet')
ok(!row.includes('animate-spin'), 'animationen er et andet sted i snittet')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('Ingen kunder'), 'den tomme liste er et andet sted')
ok(view.split(id).length === 2, 'indlaesningen findes en gang')
ok(view.split(cell).length === 2, 'indlaesningsklassen findes en gang')
ok(!view.includes('className="flex items-center justify-center py-8"'), 'den bare indlaesning er vaek')
ok(view.includes('<Loader2 className="w-6 h-6 animate-spin text-gray-400" />'), 'spinneren bliver')
ok(view.includes('data-testid="ai-project-customer-list"'), 'listen bliver')
ok(view.includes("'Ingen kunder'"), 'den tomme liste bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-loading-wrap-test')
