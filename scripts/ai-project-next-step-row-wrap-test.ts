/**
 * Naeste skridts raekke kan krympe. Knappen Opret tilbud er uaendret.
 *   npx tsx scripts/ai-project-next-step-row-wrap-test.ts
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
const id = 'data-testid="ai-project-next-step-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="flex items-center justify-between break-words min-w-0" data-testid="ai-project-next-step-row"'
const offerLines = (src: string) => src.split(/\r?\n/).filter((line) => line.trim() === 'Opret tilbud').length
ok(row.includes('flex items-center justify-between break-words min-w-0'), 'raekken kan krympe')
ok(!row.includes('Opret tilbud'), 'knapteksten er et andet sted')
ok(!row.includes('ai-project-create-offer'), 'opret-knappen er et andet sted')
ok(!row.includes('ai-project-next-step-heading'), 'overskriften er et andet sted')
ok(!row.includes('Næste skridt'), 'overskriftsteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('handleCreateOffer'), 'oprettelsen er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(!view.includes('className="flex items-center justify-between"'), 'den bare raekke er vaek')
ok(view.includes('data-testid="ai-project-create-offer"'), 'opret-knappen bliver')
ok(view.includes('onClick={handleCreateOffer}'), 'oprettelsen bliver')
ok(offerLines(view) === 1, 'teksten Opret tilbud findes en gang')
ok(view.includes('>Næste skridt<'), 'overskriftsteksten bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-next-step-row-wrap-test')
