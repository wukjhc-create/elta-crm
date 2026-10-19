/**
 * Rækken uden vaesentlige risici kan krympe. Teksten er uaendret.
 *   npx tsx scripts/ai-project-no-risks-row-wrap-test.ts
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
const id = 'data-testid="ai-project-no-risks-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="flex items-center gap-2 text-green-600 break-words min-w-0" data-testid="ai-project-no-risks-row"'
ok(row.includes('flex items-center gap-2 text-green-600 break-words min-w-0'), 'rækken kan krympe')
ok(!row.includes('Ingen væsentlige risici identificeret'), 'teksten er et andet sted')
ok(view.split(id).length === 2, 'rækken findes en gang')
ok(view.split(cell).length === 2, 'rækkeklassen findes en gang')
ok(view.split('Ingen væsentlige risici identificeret').length === 2, 'teksten findes en gang')
ok(view.includes('data-testid="ai-project-no-risks">Ingen væsentlige risici identificeret'), 'teksten bliver')
ok(view.includes('result.risks.length === 0'), 'tomlisten bliver')
ok(!view.includes('className="flex items-center gap-2 text-green-600"'), 'den bare række er væk')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-no-risks-row-wrap-test')
