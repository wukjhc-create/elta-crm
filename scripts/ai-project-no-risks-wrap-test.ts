/**
 * Teksten Ingen vaesentlige risici identificeret ombrydes.
 *   npx tsx scripts/ai-project-no-risks-wrap-test.ts
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
const id = 'data-testid="ai-project-no-risks"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'teksten ombrydes')
ok(row.includes('>Ingen væsentlige risici identificeret<'), 'teksten er uaendret')
ok(view.split('Ingen væsentlige risici identificeret').length === 2, 'teksten findes en gang')
ok(view.includes('result.risks.length === 0'), 'tomlisten bliver')
ok(view.includes('<RiskCard key={i} risk={risk} />'), 'risikokortet bliver')
ok(view.includes('data-testid="ai-project-building-complexity-label"'), 'kompleksitet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-no-risks-wrap-test')
