/**
 * Knappen Opret tilbud ombrydes. Teksten er uændret.
 *   npx tsx scripts/ai-project-create-offer-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const id = 'data-testid="ai-project-create-offer"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 360) : ''
const exact = (src: string) => src.split(/\r?\n/).filter((line) => line.trim() === 'Opret tilbud').length
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(exact(row) === 1, 'teksten er uændret')
ok(exact(view) === 1, 'teksten findes en gang')
ok(view.includes('onClick={handleCreateOffer}'), 'oprettelsen bliver')
ok(view.includes('const handleCreateOffer'), 'funktionen bliver')
ok(view.includes('data-testid="ai-project-next-step-text"'), 'forklaringen bliver')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-create-offer-wrap-test')
