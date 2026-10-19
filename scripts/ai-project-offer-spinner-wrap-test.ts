/**
 * Opret-tilbuds spinner kan krympe. Teksten Opret tilbud er uændret.
 *   npx tsx scripts/ai-project-offer-spinner-wrap-test.ts
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
const id = 'data-testid="ai-project-offer-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-4 h-4 animate-spin mr-2 break-words min-w-0" data-testid="ai-project-offer-spinner"'
const exact = (src: string) => src.split(/\r?\n/).filter((line) => line.trim() === 'Opret tilbud').length
ok(row.includes('w-4 h-4 animate-spin mr-2 break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('<Loader2'), 'det er opret-spinneren')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Opret tilbud'), 'teksten er et andet sted')
ok(!row.includes('ArrowRight'), 'pilen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(!view.includes('<Loader2 className="w-4 h-4 animate-spin mr-2" />'), 'den bare opret-spinner er vaek')
ok(exact(view) === 1, 'teksten findes en gang')
ok(view.includes('onClick={handleCreateOffer}'), 'oprettelsen bliver')
ok(view.includes('<ArrowRight className="w-4 h-4 mr-2 break-words min-w-0" data-testid="ai-project-offer-arrow" />'), 'pilen bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-offer-spinner-wrap-test')
