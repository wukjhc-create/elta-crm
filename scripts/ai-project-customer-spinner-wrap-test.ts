/**
 * Kundelistens spinner kan krympe. Foraeldre-diven er uaendret.
 *   npx tsx scripts/ai-project-customer-spinner-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-6 h-6 animate-spin text-gray-400 break-words min-w-0" data-testid="ai-project-customer-spinner"'
ok(row.includes('w-6 h-6 animate-spin text-gray-400 break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('text-gray-400'), 'farven bliver')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('Ingen kunder'), 'den tomme liste er et andet sted')
ok(!row.includes('w-5 h-5 animate-spin mr-2'), 'analyser-spinneren er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(!view.includes('className="w-6 h-6 animate-spin text-gray-400"'), 'den bare spinner er vaek')
ok(view.includes('className="flex items-center justify-center py-8 break-words min-w-0" data-testid="ai-project-customer-loading"'), 'foraeldre-diven bliver')
ok(view.includes('<Loader2 className="w-5 h-5 animate-spin mr-2 break-words min-w-0" data-testid="ai-project-analyze-spinner" />'), 'analyser-spinneren bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-spinner-wrap-test')
