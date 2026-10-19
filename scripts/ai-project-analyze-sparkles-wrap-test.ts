/**
 * Analysér-knappens ikon kan krympe. Teksten Analyser projekt er uændret.
 *   npx tsx scripts/ai-project-analyze-sparkles-wrap-test.ts
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
const id = 'data-testid="ai-project-analyze-sparkles"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 mr-2 break-words min-w-0" data-testid="ai-project-analyze-sparkles"'
ok(row.includes('w-5 h-5 mr-2 break-words min-w-0'), 'analyseikonet kan krympe')
ok(row.includes('<Sparkles'), 'det er analyseikonet')
ok(!row.includes('Analyser projekt'), 'knapteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('Analyserer'), 'venteteksten er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<Sparkles className="w-5 h-5 mr-2" />'), 'det bare ikon er vaek')
ok(view.split(/\r?\n/).filter((line) => line.trim() === 'Analyser projekt').length === 1, 'teksten findes en gang')
ok(view.includes('<Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />'), 'eksempelikonet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-analyze-sparkles-wrap-test')
