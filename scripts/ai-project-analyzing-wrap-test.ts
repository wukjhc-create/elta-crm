/**
 * Venteteksten Analyserer ombrydes. Teksten er uaendret.
 *   npx tsx scripts/ai-project-analyzing-wrap-test.ts
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
const id = 'data-testid="ai-project-analyzing"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const exact = (src: string) => src.split(/\r?\n/).filter((line) => line.trim() === 'Analyser projekt').length
ok(row.includes('break-words min-w-0'), 'venteteksten ombrydes')
ok(row.includes('Analyserer...'), 'teksten er uaendret')
ok(view.split('Analyserer...').length === 2, 'teksten findes en gang')
ok(exact(view) === 1, 'knapteksten bliver')
ok(view.includes('onClick={handleAnalyze}'), 'klikket bliver')
ok(view.includes('data-testid="ai-project-analyze"'), 'knappen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-analyzing-wrap-test')
