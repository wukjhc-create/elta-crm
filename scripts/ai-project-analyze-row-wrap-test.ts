/**
 * Analysér-knappens række kan krympe. Knappen er uaendret.
 *   npx tsx scripts/ai-project-analyze-row-wrap-test.ts
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
const id = 'data-testid="ai-project-analyze-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="mt-4 flex justify-end break-words min-w-0" data-testid="ai-project-analyze-row"'
ok(row.includes('mt-4 flex justify-end break-words min-w-0'), 'rækken kan krympe')
ok(!row.includes('Analyser projekt'), 'knappeteksten er et andet sted')
ok(view.split(id).length === 2, 'rækken findes en gang')
ok(view.split(cell).length === 2, 'rækkeklassen findes en gang')
ok(!view.includes('className="mt-4 flex justify-end"'), 'den bare række er væk')
ok(view.includes('data-testid="ai-project-analyze"'), 'knappen bliver')
ok(view.includes('onClick={handleAnalyze}'), 'klikket bliver')
ok(view.split(/\r?\n/).filter((line) => line.trim() === 'Analyser projekt').length === 1, 'teksten findes en gang')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-analyze-row-wrap-test')
