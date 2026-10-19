/**
 * Etiketten Stoerrelsesfaktor ombrydes. Teksten er uaendret.
 *   npx tsx scripts/ai-project-size-factor-label-wrap-test.ts
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
const id = 'data-testid="ai-project-size-factor-label"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>Størrelsesfaktor<'), 'teksten er uaendret')
ok(view.split('Størrelsesfaktor').length === 2, 'teksten findes en gang')
ok(view.includes('result.calculation.time.size_multiplier'), 'faktoren bliver')
ok(view.includes('data-testid="ai-project-total-time-label"'), 'totaltid bliver')
ok(view.includes('>Størrelse</dt>'), 'stoerrelse bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-size-factor-label-wrap-test')
