/**
 * Analysér-knappens spinner kan krympe. Teksten Analyserer er uaendret.
 *   npx tsx scripts/ai-project-analyze-spinner-wrap-test.ts
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
const id = 'data-testid="ai-project-analyze-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 animate-spin mr-2 break-words min-w-0" data-testid="ai-project-analyze-spinner"'
ok(row.includes('w-5 h-5 animate-spin mr-2 break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(row.includes('<Loader2'), 'det er analysespinneren')
ok(!row.includes('Analyserer'), 'teksten Analyserer er et andet sted')
ok(!row.includes('Analyser projekt'), 'knapteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(!view.includes('<Loader2 className="w-5 h-5 animate-spin mr-2" />'), 'den bare spinner er vaek')
ok(view.includes('data-testid="ai-project-analyzing">Analyserer...</span>'), 'teksten Analyserer bliver')
ok(view.includes('<Sparkles className="w-5 h-5 mr-2 break-words min-w-0" data-testid="ai-project-analyze-sparkles" />'), 'analyseikonet bliver')
ok(view.includes('<Loader2 className="w-4 h-4 animate-spin mr-2 break-words min-w-0" data-testid="ai-project-offer-spinner" />'), 'opret-spinneren bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-analyze-spinner-wrap-test')
